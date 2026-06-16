-- =====================================================================
-- בדיקת כל 20 המיגרציות — תריץ ב-Supabase SQL Editor.
-- כל 44 השדות צריכים להחזיר true.
-- =====================================================================

select
  -- 0001 initial schema (11 שדות)
  exists(select 1 from pg_tables where schemaname='public' and tablename='firms')                            as "0001_firms",
  exists(select 1 from pg_tables where schemaname='public' and tablename='user_firms')                       as "0001_user_firms",
  exists(select 1 from pg_tables where schemaname='public' and tablename='companies')                        as "0001_companies",
  exists(select 1 from pg_tables where schemaname='public' and tablename='users')                            as "0001_users",
  exists(select 1 from pg_tables where schemaname='public' and tablename='suppliers')                        as "0001_suppliers",
  exists(select 1 from pg_tables where schemaname='public' and tablename='invoices_inbox')                   as "0001_invoices",
  exists(select 1 from pg_tables where schemaname='public' and tablename='journal_entries')                  as "0001_je",
  exists(select 1 from pg_tables where schemaname='public' and tablename='journal_entry_lines')              as "0001_je_lines",
  exists(select 1 from pg_tables where schemaname='public' and tablename='movein_batches')                   as "0001_batches",
  exists(select 1 from pg_tables where schemaname='public' and tablename='audit_log')                        as "0001_audit_log",
  exists(select 1 from pg_tables where schemaname='public' and tablename='account_mapping_rules')            as "0001_account_mapping",

  -- 0002 admin security
  exists(select 1 from information_schema.columns where table_name='users' and column_name='role')           as "0002_users_role",

  -- 0006 bank
  exists(select 1 from pg_tables where schemaname='public' and tablename='bank_transactions')                as "0006_bank_tx",

  -- 0007 inbox token
  exists(select 1 from information_schema.columns where table_name='companies' and column_name='inbox_token') as "0007_inbox_token",

  -- 0008 fx_rates
  exists(select 1 from pg_tables where schemaname='public' and tablename='fx_rates')                         as "0008_fx_rates",

  -- 0009 customers + items + accounts
  exists(select 1 from pg_tables where schemaname='public' and tablename='customers')                        as "0009_customers",
  exists(select 1 from pg_tables where schemaname='public' and tablename='items')                            as "0009_items",
  exists(select 1 from pg_tables where schemaname='public' and tablename='accounts')                         as "0009_accounts",

  -- 0010 sales_invoices
  exists(select 1 from pg_tables where schemaname='public' and tablename='sales_invoices')                   as "0010_sales",
  exists(select 1 from information_schema.columns where table_name='journal_entries' and column_name='sales_invoice_id') as "0010_je_sales_invoice_id",

  -- 0011 payroll
  exists(select 1 from pg_tables where schemaname='public' and tablename='payroll_entries')                  as "0011_payroll",
  exists(select 1 from information_schema.columns where table_name='journal_entries' and column_name='payroll_entry_id') as "0011_je_payroll_entry_id",

  -- 0012 periods + JE numbering
  exists(select 1 from pg_tables where schemaname='public' and tablename='accounting_periods')               as "0012_periods",
  exists(select 1 from information_schema.columns where table_name='journal_entries' and column_name='je_number') as "0012_je_je_number",

  -- 0013 rule notes
  exists(select 1 from pg_tables where schemaname='public' and tablename='rule_improvement_notes')           as "0013_rule_notes",

  -- 0014 pcn874
  exists(select 1 from pg_tables where schemaname='public' and tablename='pcn874_exports')                   as "0014_pcn874",

  -- 0015 fixed assets
  exists(select 1 from pg_tables where schemaname='public' and tablename='fixed_assets')                     as "0015_assets",
  exists(select 1 from pg_tables where schemaname='public' and tablename='fixed_asset_depreciation_runs')    as "0015_dep_runs",
  exists(select 1 from information_schema.columns where table_name='journal_entries' and column_name='fixed_asset_id') as "0015_je_fixed_asset_id",

  -- 0016 VAT compliance
  exists(select 1 from information_schema.columns where table_name='companies' and column_name='vat_basis')              as "0016_company_vat_basis",
  exists(select 1 from information_schema.columns where table_name='companies' and column_name='vat_filing_frequency')   as "0016_company_vat_filing",
  exists(select 1 from information_schema.columns where table_name='suppliers' and column_name='dealer_status')          as "0016_supplier_dealer_status",
  exists(select 1 from information_schema.columns where table_name='journal_entries' and column_name='vat_reporting_date') as "0016_je_vat_reporting_date",
  exists(select 1 from pg_tables where schemaname='public' and tablename='vat_rates_history')                            as "0016_vat_rates",
  (select count(*) = 5 from vat_rates_history)                                                                           as "0016_vat_rates_count_5",
  (select get_vat_rate_for_date('2024-06-15') = 0.17)                                                                    as "0016_rate_2024_is_17",
  (select get_vat_rate_for_date('2025-06-15') = 0.18)                                                                    as "0016_rate_2025_is_18",

  -- 0017 PCN874 corrections
  exists(select 1 from information_schema.columns where table_name='pcn874_exports' and column_name='is_correction')     as "0017_874_is_correction",
  exists(select 1 from information_schema.columns where table_name='pcn874_exports' and column_name='correction_of_id')  as "0017_874_correction_of_id",
  exists(select 1 from pg_tables where schemaname='public' and tablename='period_reopens')                               as "0017_period_reopens",

  -- 0018 workflow
  exists(select 1 from information_schema.columns where table_name='invoices_inbox' and column_name='reviewed_at')       as "0018_invoice_reviewed_at",
  exists(select 1 from information_schema.columns where table_name='suppliers' and column_name='learned_from_count')     as "0018_supplier_learned_count",

  -- 0019 OCR feedback
  exists(select 1 from pg_tables where schemaname='public' and tablename='ocr_corrections')                              as "0019_ocr_corrections",
  exists(select 1 from information_schema.columns where table_name='companies' and column_name='auto_approve_ocr_threshold') as "0019_auto_approve",

  -- 0020 cost center on lines
  exists(select 1 from information_schema.columns where table_name='journal_entry_lines' and column_name='cost_center')  as "0020_lines_cost_center";
