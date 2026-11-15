-- 0016: pin search_path on internal helper functions (Supabase advisor: function_search_path_mutable).
-- Bodies only use pg_catalog builtins and schema-qualified calls, so an empty search_path is safe.
alter function app_private.set_updated_at() set search_path = '';
alter function app_private.strip_latex(text) set search_path = '';
alter function app_private.slugify(text) set search_path = '';
alter function app_private.append_only() set search_path = '';
