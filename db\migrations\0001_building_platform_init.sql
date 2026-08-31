-- 건축물 데이터 분석 플랫폼 - 초기 스키마
-- 설계 문서 05절과 동일. 실행에는 PostgreSQL 15+ / PostGIS 3.4+ 필요.
-- 아직 실제 DB 인스턴스에 적용된 적 없음 (Phase 1 산출물, Phase 0 키 발급과 별개로 먼저 준비해둔 것).

CREATE EXTENSION IF NOT EXISTS postgis;

-- 건축물대장 (표제부 + 총괄표제부 매핑)
CREATE TABLE buildings (
  id                BIGSERIAL PRIMARY KEY,
  mgm_bld_pk        TEXT UNIQUE NOT NULL,  -- 건축HUB 관리건축물대장PK
  bld_name          TEXT,                  -- bldNm
  address_jibun     TEXT,                  -- platPlc
  address_road      TEXT,                  -- newPlatPlc
  sigungu_cd        TEXT NOT NULL,
  bjdong_cd         TEXT NOT NULL,
  main_purps_cd     TEXT,
  main_purps_nm     TEXT,                  -- mainPurpsCdNm
  total_area_m2     NUMERIC,               -- totArea
  arch_area_m2      NUMERIC,               -- archArea
  plat_area_m2      NUMERIC,               -- platArea
  floor_ground_cnt  SMALLINT,
  floor_under_cnt   SMALLINT,
  struct_cd         TEXT,
  struct_nm         TEXT,
  use_apr_day       DATE,                  -- useAprDay 파싱, NULL 허용
  use_apr_year      SMALLINT GENERATED ALWAYS AS (EXTRACT(YEAR FROM use_apr_day)) STORED,
  geom              geometry(Point, 4326), -- 08절 지오코딩 결과
  geocode_source    TEXT,                  -- 'kakao_local' 등, NULL이면 미지오코딩
  geocode_confidence TEXT,                 -- 'exact' | 'approx' | 'none'
  raw_payload       JSONB,                 -- 원본 응답 보관(재처리 대비)
  synced_at         TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_buildings_geom ON buildings USING GIST (geom);
CREATE INDEX idx_buildings_sigungu ON buildings (sigungu_cd, bjdong_cd);
CREATE INDEX idx_buildings_use_apr_year ON buildings (use_apr_year);

-- 주택인허가
CREATE TABLE housing_permits (
  id                 BIGSERIAL PRIMARY KEY,
  permit_key         TEXT UNIQUE NOT NULL,  -- 건축HUB 발급 고유키
  project_name       TEXT,                  -- bldNm 대체 표기, 사업명 아님을 명시
  address_jibun      TEXT,
  sigungu_cd         TEXT NOT NULL,
  bjdong_cd          TEXT NOT NULL,
  household_cnt      INTEGER,               -- hhldCnt
  floor_ground_cnt   SMALLINT,
  floor_under_cnt    SMALLINT,
  total_area_m2      NUMERIC,
  plat_area_m2       NUMERIC,
  permit_day         DATE,                  -- pmsDay
  start_cnstwk_day   DATE,                  -- stcnsDay
  use_inspect_day    DATE,                  -- useInsptDay
  status TEXT GENERATED ALWAYS AS (
    CASE
      WHEN use_inspect_day IS NOT NULL THEN 'completed'
      WHEN start_cnstwk_day IS NOT NULL THEN 'construction'
      WHEN permit_day IS NOT NULL THEN 'permitted'
      ELSE 'unknown'
    END
  ) STORED,
  geom                 geometry(Point, 4326),
  geocode_source       TEXT,
  matched_building_id  BIGINT REFERENCES buildings(id), -- 09절 연계 결과, nullable
  match_confidence     TEXT,                -- 'address_exact' | 'spatial_50m' | 'none'
  raw_payload          JSONB,
  synced_at            TIMESTAMPTZ NOT NULL
);
CREATE INDEX idx_permits_geom ON housing_permits USING GIST (geom);
CREATE INDEX idx_permits_status ON housing_permits (status);

-- 행정경계 (지역 통계용 폴리곤 - SGIS/행안부 경계 데이터 별도 적재 필요)
CREATE TABLE admin_boundaries (
  id     BIGSERIAL PRIMARY KEY,
  level  TEXT NOT NULL,   -- 'sigungu' | 'emd'
  code   TEXT UNIQUE NOT NULL,
  name   TEXT NOT NULL,
  geom   geometry(MultiPolygon, 4326)
);
CREATE INDEX idx_admin_geom ON admin_boundaries USING GIST (geom);

-- 수집 로그
CREATE TABLE api_sync_log (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,     -- 'building_ledger' | 'housing_permit'
  sigungu_cd    TEXT,
  status        TEXT NOT NULL,     -- 'success' | 'partial' | 'failed'
  rows_fetched  INTEGER,
  rows_upserted INTEGER,
  error_message TEXT,
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ
);

-- 지오코딩 캐시 (재조회 방지)
CREATE TABLE geocode_cache (
  address_key  TEXT PRIMARY KEY,   -- 정규화된 주소 문자열
  geom         geometry(Point, 4326) NOT NULL,
  source       TEXT NOT NULL,
  confidence   TEXT NOT NULL,
  cached_at    TIMESTAMPTZ NOT NULL
);

-- 노후도 기준 (설정값으로 관리 - src/services/ageBands.ts의 AGE_BANDS와 동일한 값을 유지할 것)
CREATE TABLE age_bands (
  id          SMALLINT PRIMARY KEY,
  label       TEXT NOT NULL,       -- '신축' | '양호' | '보통' | '노후' | '고노후'
  min_years   SMALLINT NOT NULL,
  max_years   SMALLINT,            -- NULL = 상한 없음
  color_hex   TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL
);
INSERT INTO age_bands VALUES
  (1, '신축', 0,  5,    '#38BDF8', 1),
  (2, '양호', 5,  10,   '#3B82F6', 2),
  (3, '보통', 10, 20,   '#8B5CF6', 3),
  (4, '노후', 20, 30,   '#F97316', 4),
  (5, '고노후', 30, NULL, '#F43F5E', 5);

