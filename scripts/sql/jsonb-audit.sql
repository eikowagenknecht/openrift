-- Double-encoded jsonb audit. Run before and after migration 244.
-- Every "corrupt" count must be 0 afterwards.
SELECT table_name || '.' || column_name AS jsonb_column,
       total,
       corrupt,
       CASE WHEN corrupt = 0 THEN 'ok' ELSE 'DOUBLE-ENCODED' END AS status
FROM (
  SELECT c.table_name,
         c.column_name,
         (xpath('/row/c/text()',
                query_to_xml(format('SELECT count(*) AS c FROM %I.%I', c.table_schema, c.table_name),
                             false, true, '')))[1]::text::bigint AS total,
         (xpath('/row/c/text()',
                query_to_xml(format('SELECT count(*) AS c FROM %I.%I WHERE jsonb_typeof(%I) = ''string''',
                                    c.table_schema, c.table_name, c.column_name),
                             false, true, '')))[1]::text::bigint AS corrupt
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema = c.table_schema
   AND t.table_name = c.table_name
   AND t.table_type = 'BASE TABLE'
  WHERE c.table_schema = 'public' AND c.data_type = 'jsonb'
) s
ORDER BY corrupt DESC, jsonb_column;
