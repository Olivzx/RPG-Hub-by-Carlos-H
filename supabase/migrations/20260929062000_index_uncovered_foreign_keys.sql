-- Add B-tree indexes for foreign keys not already covered by an index prefix.
-- This avoids full child-table scans when referenced rows are updated/deleted.
do $$
declare
  fk record;
  index_name text;
  index_columns text;
begin
  for fk in
    with foreign_keys as (
      select
        c.conrelid,
        c.conname,
        c.conkey::smallint[] as attnums,
        array_agg(a.attname::text order by k.ord) as cols
      from pg_constraint c
      cross join lateral unnest(c.conkey) with ordinality k(attnum,ord)
      join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum
      where c.contype='f'
        and c.connamespace='public'::regnamespace
      group by c.conrelid,c.conname,c.conkey
    )
    select f.*
    from foreign_keys f
    where not exists (
      select 1
      from pg_index i
      where i.indrelid=f.conrelid
        and i.indisvalid
        and i.indisready
        and i.indpred is null
        and (
          select array_agg(i.indkey[g.i]::smallint order by g.i)
          from generate_series(0,array_length(f.attnums,1)-1) as g(i)
        )=f.attnums
    )
  loop
    select string_agg(format('%I',column_name),',')
      into index_columns
      from unnest(fk.cols) as c(column_name);

    index_name := left(
      'idx_fk_' || replace(fk.conrelid::regclass::text,'.','_') || '_' || array_to_string(fk.cols,'_'),
      48
    ) || '_' || left(md5(fk.conname),10);

    execute format(
      'create index if not exists %I on %s (%s)',
      index_name,
      fk.conrelid::regclass,
      index_columns
    );
  end loop;
end
$$;
