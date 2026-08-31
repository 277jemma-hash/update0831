export interface KaptBasicInfo {
    /**
     * 한국부동산원 공동주택 단지고유번호
     * 원 API 필드: COMPLEX_PK
     *
     * 기존 server.ts와의 호환을 위해 kaptCode라는 이름은 유지한다.
     */
    kaptCode: string;

    /** 한국부동산원 원본 PNU - 건축물대장 대표지번 연결용 */
    pnu: string | null;

    /**
     * 대표 단지명
     */
    kaptName: string;

    /**
     * 지번 주소
     * 원 API 필드: ADRES
     */
    address: string | null;

    /**
     * 현재 API에는 별도의 법정동코드 필드가 없으므로 null
     */
    bjdCode: string | null;

    /**
     * 세대수
     * 원 API 필드: UNIT_CNT
     */
    households: number | null;

    /**
     * 동수
     * 원 API 필드: DONG_CNT
     */
    dongCount: number | null;

    /**
     * 사용승인일
     * 원 API 필드: USEAPR_DT
     */
    useDate: string | null;
}

interface RebAptInfoRecord {
    COMPLEX_PK?: string | null;
    PNU?: string | null;
    ADRES?: string | null;

    COMPLEX_NM1?: string | null;
    COMPLEX_NM2?: string | null;
    COMPLEX_NM3?: string | null;

    COMPLEX_GB_CD?: string | null;

    DONG_CNT?: number | string | null;
    UNIT_CNT?: number | string | null;

    USEAPR_DT?: string | null;
}

interface RebAptInfoResponse {
    page?: number;
    perPage?: number;
    totalCount?: number;
    currentCount?: number;
    matchCount?: number;
    data?: RebAptInfoRecord[];
}

export class KaptBasisService {

    /**
     * 한국부동산원 공동주택 단지 식별정보 조회 서비스
     *
     * Base URL:
     * https://api.odcloud.kr/api
     *
     * API:
     * GET /AptIdInfoSvc/v1/getAptInfo
     */
    private static readonly APT_INFO_URL =
        'https://api.odcloud.kr/api/AptIdInfoSvc/v1/getAptInfo';

    /**
     * 동일 주소 반복 호출 방지 캐시
     */
    private static readonly CACHE_TTL_MS =
        30 * 60 * 1000;

    private readonly serviceKey: string;

    /**
     * 주소 단위 검색결과 캐시
     */
    private readonly searchCache = new Map<
        string,
        {
            loadedAt: number;
            items: RebAptInfoRecord[];
        }
    >();

    /**
     * 단지별 최종 결과 캐시
     */
    private readonly basicCache = new Map<
        string,
        {
            loadedAt: number;
            info: KaptBasicInfo | null;
        }
    >();

    constructor(serviceKey?: string) {

        const key =
            serviceKey ||
            process.env.KAPT_API_KEY ||
            process.env.MOLIT_SERVICE_KEY ||
            process.env.BUILDING_LEDGER_API_KEY;

        if (!key) {
            throw new Error(
                '한국부동산원 공동주택 단지 식별정보 API 인증키가 없습니다. ' +
                '.env의 KAPT_API_KEY를 확인하세요.'
            );
        }

        this.serviceKey = key;
    }

    /**
     * 기존 server.ts에서 호출하는 메서드.
     *
     * sigunguCd는 기존 인터페이스 호환을 위해 받지만
     * 한국부동산원 getAptInfo는 시군구코드 검색조건이 없다.
     *
     * 실제 검색은 실거래가에 포함된
     * "동 + 지번" 주소(addressHint)를 사용한다.
     *
     * 예:
     * complexName = "신림동신도브래뉴"
     * addressHint = "신림동 1722"
     */
    async resolveBasicInfo(
        sigunguCd: string,
        complexName: string,
        addressHint?: string | null
    ): Promise<KaptBasicInfo | null> {

        if (!complexName) {
            return null;
        }

        const cleanAddress =
            this.normalizeAddressSearchText(
                addressHint || ''
            );

        if (!cleanAddress) {

            console.warn(
                '[REB AptInfo] 주소 힌트가 없어 조회하지 않습니다.',
                {
                    sigunguCd,
                    complexName,
                    addressHint
                }
            );

            return null;
        }

        /**
         * 동일 단지 + 주소 반복 조회 방지
         */
        const cacheKey =
            `${sigunguCd}|` +
            `${this.normalizeComplexName(complexName)}|` +
            `${cleanAddress}`;

        const cached =
            this.basicCache.get(cacheKey);

        if (
            cached &&
            Date.now() - cached.loadedAt <
            KaptBasisService.CACHE_TTL_MS
        ) {
            return cached.info;
        }

        try {

            /**
             * 주소 LIKE 조회
             *
             * Swagger:
             * cond[ADRES::LIKE]
             */
            const candidates =
                await this.fetchByAddress(
                    cleanAddress
                );

            if (candidates.length === 0) {

                console.warn(
                    '[REB AptInfo] 주소 검색 결과 없음',
                    {
                        complexName,
                        addressHint,
                        cleanAddress
                    }
                );

                this.basicCache.set(
                    cacheKey,
                    {
                        loadedAt: Date.now(),
                        info: null
                    }
                );

                return null;
            }

            /**
             * 같은 지번에 여러 공동주택 레코드가 있을 수 있으므로
             * 단지명을 이용해 최적 후보를 선택한다.
             */
            const best =
                this.findBestComplex(
                    candidates,
                    complexName,
                    addressHint || ''
                );

            if (!best) {

                console.warn(
                    '[REB AptInfo] 단지명 매칭 실패',
                    {
                        complexName,
                        addressHint,
                        candidateCount:
                        candidates.length
                    }
                );

                this.basicCache.set(
                    cacheKey,
                    {
                        loadedAt: Date.now(),
                        info: null
                    }
                );

                return null;
            }

            const info =
                this.mapBasicInfo(best);

            this.basicCache.set(
                cacheKey,
                {
                    loadedAt: Date.now(),
                    info
                }
            );

            console.log(
                '\n============================================================'
            );

            console.log(
                '[REB AptInfo] 최종 매칭'
            );

            console.log(
                '[실거래 단지명]',
                complexName
            );

            console.log(
                '[실거래 주소]',
                addressHint
            );

            console.log(
                '[COMPLEX_PK]',
                info.kaptCode
            );

            console.log(
                '[단지명]',
                info.kaptName
            );

            console.log(
                '[주소]',
                info.address
            );

            console.log(
                '[세대수 UNIT_CNT]',
                info.households
            );

            console.log(
                '[동수 DONG_CNT]',
                info.dongCount
            );

            console.log(
                '[사용승인일 USEAPR_DT]',
                info.useDate
            );

            console.log(
                '============================================================\n'
            );

            return info;

        } catch (error: any) {

            console.warn(
                '[REB AptInfo] 조회 실패',
                {
                    complexName,
                    addressHint,
                    error:
                        error?.message ||
                        String(error)
                }
            );

            this.basicCache.set(
                cacheKey,
                {
                    loadedAt: Date.now(),
                    info: null
                }
            );

            return null;
        }
    }

    /**
     * 주소를 이용하여 getAptInfo 조회.
     *
     * 한국부동산원 Swagger 기준:
     *
     * page
     * perPage
     * returnType
     * cond[ADRES::LIKE]
     * serviceKey
     */
    private async fetchByAddress(
        address: string
    ): Promise<RebAptInfoRecord[]> {

        const cacheKey =
            this.normalizeAddressSearchText(
                address
            );

        const cached =
            this.searchCache.get(cacheKey);

        if (
            cached &&
            Date.now() - cached.loadedAt <
            KaptBasisService.CACHE_TTL_MS
        ) {
            return cached.items;
        }

        const all: RebAptInfoRecord[] = [];

        let page = 1;

        /**
         * 주소 LIKE이므로 일반적으로 수십 건 이하겠지만
         * 안전하게 100건씩 조회한다.
         */
        const perPage = 100;

        /**
         * 비정상 응답 무한루프 방지
         */
        for (
            let guard = 0;
            guard < 20;
            guard++
        ) {

            const response =
                await this.fetchPage(
                    page,
                    perPage,
                    {
                        'cond[ADRES::LIKE]':
                        address
                    }
                );

            const items =
                Array.isArray(
                    response.data
                )
                    ? response.data
                    : [];

            all.push(...items);

            const totalCount =
                this.toNumber(
                    response.totalCount
                ) ?? 0;

            const currentCount =
                this.toNumber(
                    response.currentCount
                ) ?? items.length;

            /**
             * 다음 페이지가 없으면 종료.
             */
            if (
                items.length === 0 ||
                currentCount < perPage ||
                (
                    totalCount > 0 &&
                    all.length >= totalCount
                )
            ) {
                break;
            }

            page++;
        }

        this.searchCache.set(
            cacheKey,
            {
                loadedAt: Date.now(),
                items: all
            }
        );

        console.log(
            '[REB AptInfo] 주소검색:',
            address,
            '=>',
            all.length,
            '건'
        );

        return all;
    }

    /**
     * odcloud 한국부동산원 API 실제 호출
     */
    private async fetchPage(
        page: number,
        perPage: number,
        conditions: Record<
            string,
            string
        >
    ): Promise<RebAptInfoResponse> {

        const params =
            new URLSearchParams();

        params.set(
            'page',
            String(page)
        );

        params.set(
            'perPage',
            String(perPage)
        );

        params.set(
            'returnType',
            'JSON'
        );

        /**
         * odcloud는 serviceKey를 query parameter로 받을 수 있다.
         *
         * URLSearchParams가 자동으로 Encoding하므로
         * 인증키를 미리 encodeURIComponent 하지 않는다.
         */
        params.set(
            'serviceKey',
            this.serviceKey
        );

        for (
            const [
                key,
                value
            ]
            of Object.entries(
            conditions
        )
            ) {

            if (
                value !== undefined &&
                value !== null &&
                String(value).trim()
            ) {

                params.set(
                    key,
                    String(value).trim()
                );
            }
        }

        const url =
            `${KaptBasisService.APT_INFO_URL}?` +
            params.toString();

        const controller =
            new AbortController();

        const timeoutId =
            setTimeout(
                () =>
                    controller.abort(),
                10000
            );

        try {

            const response =
                await fetch(
                    url,
                    {
                        method: 'GET',

                        signal:
                        controller.signal,

                        headers: {
                            Accept:
                                'application/json'
                        }
                    }
                );

            const text =
                await response.text();

            /**
             * CMD 확인용 로그
             *
             * 인증키가 포함된 전체 URL은 출력하지 않는다.
             */
            console.log(
                '\n============================================================'
            );

            console.log(
                '[REB AptInfo] API RESPONSE'
            );

            console.log(
                '[URL]',
                KaptBasisService.APT_INFO_URL
            );

            console.log(
                '[PAGE]',
                page
            );

            console.log(
                '[PER_PAGE]',
                perPage
            );

            console.log(
                '[CONDITIONS]',
                conditions
            );

            console.log(
                '[HTTP STATUS]',
                response.status
            );

            console.log(
                '[RAW RESPONSE]'
            );

            console.log(
                text
            );

            console.log(
                '============================================================\n'
            );

            if (!response.ok) {

                throw new Error(
                    `[REB AptInfo] ` +
                    `HTTP ${response.status} ` +
                    `${response.statusText}: ` +
                    `${text.slice(0, 500)}`
                );
            }

            let json:
                RebAptInfoResponse;

            try {

                json =
                    JSON.parse(text);

            } catch {

                throw new Error(
                    '[REB AptInfo] JSON 파싱 실패: ' +
                    text.slice(
                        0,
                        500
                    )
                );
            }

            return json;

        } catch (
            error: any
            ) {

            if (
                error?.name ===
                'AbortError'
            ) {

                throw new Error(
                    '[REB AptInfo] API 요청 Timeout'
                );
            }

            throw error;

        } finally {

            clearTimeout(
                timeoutId
            );
        }
    }

    /**
     * 후보들 중 실제 실거래 단지와 가장 가까운 레코드를 선택.
     */
    private findBestComplex(
        items: RebAptInfoRecord[],
        complexName: string,
        addressHint: string
    ): RebAptInfoRecord | null {

        if (
            items.length === 0
        ) {
            return null;
        }

        const targetName =
            this.normalizeComplexName(
                complexName
            );

        const targetParcel =
            this.extractParcel(
                addressHint
            );

        let best:
            RebAptInfoRecord | null =
            null;

        let bestScore =
            -999999;

        for (
            const item
            of items
            ) {

            let score = 0;

            /**
             * 주소 지번 일치
             */
            const recordParcel =
                this.extractParcel(
                    item.ADRES || ''
                );

            if (
                targetParcel &&
                recordParcel
            ) {

                if (
                    targetParcel ===
                    recordParcel
                ) {
                    score += 200;
                } else {
                    score -= 100;
                }
            }

            /**
             * API에는 단지명이 세 가지 기준으로 존재한다.
             *
             * 공시가격
             * 건축물대장
             * 도로명주소
             */
            const names = [
                item.COMPLEX_NM1,
                item.COMPLEX_NM2,
                item.COMPLEX_NM3
            ]
                .filter(
                    (
                        value
                    ): value is string =>
                        !!value
                );

            let highestNameScore =
                0;

            for (
                const name
                of names
                ) {

                const recordName =
                    this.normalizeComplexName(
                        name
                    );

                if (
                    !targetName ||
                    !recordName
                ) {
                    continue;
                }

                /**
                 * 완전일치
                 */
                if (
                    recordName ===
                    targetName
                ) {

                    highestNameScore =
                        Math.max(
                            highestNameScore,
                            150
                        );

                    continue;
                }

                /**
                 * 접두/접미 표기차이
                 */
                if (
                    recordName.includes(
                        targetName
                    ) ||
                    targetName.includes(
                        recordName
                    )
                ) {

                    highestNameScore =
                        Math.max(
                            highestNameScore,
                            100
                        );

                    continue;
                }

                /**
                 * 부분 토큰 유사도
                 */
                const similarity =
                    this.calculateNameSimilarity(
                        targetName,
                        recordName
                    );

                if (
                    similarity >= 0.75
                ) {

                    highestNameScore =
                        Math.max(
                            highestNameScore,
                            Math.round(
                                similarity * 80
                            )
                        );
                }
            }

            score +=
                highestNameScore;

            /**
             * 아파트 단지 종류
             *
             * Swagger:
             * COMPLEX_GB_CD
             * 1 = 아파트
             */
            if (
                String(
                    item.COMPLEX_GB_CD ||
                    ''
                ) === '1'
            ) {
                score += 10;
            }

            if (
                score >
                bestScore
            ) {

                best =
                    item;

                bestScore =
                    score;
            }
        }

        /**
         * 주소 또는 단지명 중 어느 것도
         * 신뢰할 수준으로 맞지 않으면 연결하지 않는다.
         */
        if (
            bestScore < 100
        ) {

            console.warn(
                '[REB AptInfo] 신뢰도 부족:',
                {
                    complexName,
                    addressHint,
                    bestScore
                }
            );

            return null;
        }

        return best;
    }

    /**
     * 한국부동산원 원본 데이터를 기존 인터페이스로 변환.
     */
    private mapBasicInfo(
        item: RebAptInfoRecord
    ): KaptBasicInfo {

        const households =
            this.toNumber(
                item.UNIT_CNT
            );

        const dongCount =
            this.toNumber(
                item.DONG_CNT
            );

        const names = [
            item.COMPLEX_NM1,
            item.COMPLEX_NM2,
            item.COMPLEX_NM3
        ];

        const kaptName =
            names.find(
                value =>
                    !!value &&
                    String(value).trim()
            ) || '';

        return {

            /**
             * 기존 코드 호환을 위해
             * COMPLEX_PK를 kaptCode에 저장
             */
            kaptCode:
                String(
                    item.COMPLEX_PK ||
                    ''
                ).trim(),

            pnu:
                item.PNU ? String(item.PNU).trim() : null,

            kaptName:
                String(
                    kaptName
                ).trim(),

            address:
                item.ADRES
                    ? String(
                        item.ADRES
                    ).trim()
                    : null,

            /**
             * getAptInfo 응답에는
             * 법정동코드 자체는 없다.
             *
             * PNU가 있지만 현재 로직에서는
             * 굳이 bjdCode로 변환하지 않는다.
             */
            bjdCode:
                null,

            households:
                households !== null &&
                households > 0
                    ? Math.round(
                        households
                    )
                    : null,

            dongCount:
                dongCount !== null &&
                dongCount > 0
                    ? Math.round(
                        dongCount
                    )
                    : null,

            useDate:
                item.USEAPR_DT
                    ? String(
                        item.USEAPR_DT
                    ).trim()
                    : null
        };
    }

    /**
     * 실거래 주소를 API LIKE 검색어로 정리.
     *
     * 예:
     * "서울특별시 관악구 신림동 1722"
     * → "신림동 1722"
     *
     * 이미:
     * "신림동 1722"
     * 이면 그대로 사용.
     */
    private normalizeAddressSearchText(
        value: string
    ): string {

        const text =
            (value || '')
                .normalize('NFKC')
                .replace(
                    /\s+/g,
                    ' '
                )
                .trim();

        if (!text) {
            return '';
        }

        /**
         * 동/가 + 지번이 있으면 그 부분만 추출.
         */
        const parcelMatch =
            text.match(
                /([가-힣0-9]+(?:동|가|읍|면|리))\s*(산\s*)?(\d+)(?:-(\d+))?/
            );

        if (
            parcelMatch
        ) {

            const dong =
                parcelMatch[1];

            const mountain =
                parcelMatch[2]
                    ? '산 '
                    : '';

            const main =
                Number(
                    parcelMatch[3]
                );

            const sub =
                parcelMatch[4] &&
                Number(
                    parcelMatch[4]
                ) !== 0
                    ? `-${Number(parcelMatch[4])}`
                    : '';

            return (
                `${dong} ` +
                `${mountain}` +
                `${main}` +
                sub
            );
        }

        return text;
    }

    /**
     * 단지명 비교 정규화.
     */
    private normalizeComplexName(
        value: string
    ): string {

        let normalized =
            (value || '')
                .normalize('NFKC')
                .replace(
                    /\s+/g,
                    ''
                )
                .replace(
                    /[()（）·ㆍ.,_\-]/g,
                    ''
                )
                .toLowerCase();

        /**
         * 반복적으로 접미사를 제거.
         *
         * 예:
         * 은천1단지아파트
         * → 은천1
         */
        let previous = '';

        while (
            normalized &&
            normalized !==
            previous
            ) {

            previous =
                normalized;

            normalized =
                normalized.replace(
                    /(아파트|공동주택|주상복합|apt|단지)$/gi,
                    ''
                );
        }

        return normalized;
    }

    /**
     * 문자열 유사도
     *
     * 단순 Dice coefficient.
     */
    private calculateNameSimilarity(
        a: string,
        b: string
    ): number {

        if (
            !a ||
            !b
        ) {
            return 0;
        }

        if (
            a === b
        ) {
            return 1;
        }

        if (
            a.length === 1 ||
            b.length === 1
        ) {
            return a === b
                ? 1
                : 0;
        }

        const makeBigrams =
            (
                value: string
            ): string[] => {

                const result:
                    string[] = [];

                for (
                    let i = 0;
                    i <
                    value.length - 1;
                    i++
                ) {

                    result.push(
                        value.slice(
                            i,
                            i + 2
                        )
                    );
                }

                return result;
            };

        const first =
            makeBigrams(a);

        const second =
            makeBigrams(b);

        const counts =
            new Map<
                string,
                number
            >();

        for (
            const token
            of second
            ) {

            counts.set(
                token,
                (
                    counts.get(
                        token
                    ) || 0
                ) + 1
            );
        }

        let intersection =
            0;

        for (
            const token
            of first
            ) {

            const count =
                counts.get(
                    token
                ) || 0;

            if (
                count > 0
            ) {

                intersection++;

                counts.set(
                    token,
                    count - 1
                );
            }
        }

        return (
                2 *
                intersection
            ) /
            (
                first.length +
                second.length
            );
    }

    /**
     * 주소에서 동 + 지번 비교키 생성.
     *
     * 신림동 1722
     * 신림동 1722-0
     *
     * 둘 다:
     * 신림동:1722
     */
    private extractParcel(
        value: string
    ): string {

        const text =
            (value || '')
                .normalize('NFKC');

        const match =
            text.match(
                /([가-힣0-9]+(?:동|가|읍|면|리))\s*(산\s*)?(\d+)(?:-(\d+))?/
            );

        if (!match) {
            return '';
        }

        const dong =
            match[1];

        const mountain =
            match[2]
                ? '산'
                : '';

        const main =
            Number(
                match[3]
            );

        const sub =
            match[4] &&
            Number(
                match[4]
            ) !== 0
                ? `-${Number(match[4])}`
                : '';

        return (
            `${dong}:` +
            `${mountain}` +
            `${main}` +
            sub
        );
    }

    /**
     * 숫자 변환.
     */
    private toNumber(
        value: unknown
    ): number | null {

        if (
            value ===
            undefined ||
            value ===
            null ||
            value === ''
        ) {
            return null;
        }

        const numberValue =
            Number(
                String(value)
                    .replace(
                        /,/g,
                        ''
                    )
                    .trim()
            );

        return Number.isFinite(
            numberValue
        )
            ? numberValue
            : null;
    }
}

