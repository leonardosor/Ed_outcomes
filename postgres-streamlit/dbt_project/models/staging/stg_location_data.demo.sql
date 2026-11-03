{{ config(materialized='view') }}

select
    cast(latitude as decimal(10,6)) as latitude,
    cast(longitude as decimal(10,6)) as longitude,
    zip,
    county,
    county_fips,
    state,
    state_fips,
    current_timestamp as loaded_at
from {{ source('test', 'location_data') }}
