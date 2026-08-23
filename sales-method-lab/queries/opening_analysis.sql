-- =============================================================================
-- bm-sales-method-lab: opening analysis — lead journey end to end
-- Read-only. Runs against schema `lab` (nightly materialized snapshot).
-- Enum values in production are unknown to the lab, so every section that
-- relies on a value (direction, status, event_type) is preceded by a raw
-- distribution dump, and matching uses tolerant patterns.
-- =============================================================================
\pset pager off
\set ON_ERROR_STOP off
\timing off

SELECT '=== S0 FRESHNESS (max timestamps per matview) ===' AS section;
SELECT 'leads' src, max(created_at) latest, count(*) rows FROM lab.leads
UNION ALL SELECT 'lead_events', max(occurred_at), count(*) FROM lab.lead_events
UNION ALL SELECT 'wa_outbound', max(created_at), count(*) FROM lab.wa_outbound
UNION ALL SELECT 'wa_inbound', max(occurred_at), count(*) FROM lab.wa_inbound
UNION ALL SELECT 'phone_calls', max(starttime), count(*) FROM lab.phone_calls
UNION ALL SELECT 'showings', max(created_at), count(*) FROM lab.showings
UNION ALL SELECT 'conversation_outcomes', max(occurred_at), count(*) FROM lab.conversation_outcomes
UNION ALL SELECT 'tasks', max(created_at), count(*) FROM lab.tasks
UNION ALL SELECT 'brokerage_agreements', max(created_at), count(*) FROM lab.brokerage_agreements
ORDER BY 1;

SELECT '=== S1 LEAD VOLUME ===' AS section;
SELECT count(*) total,
       count(*) FILTER (WHERE coalesce(is_duplicate,false)) duplicates,
       count(*) FILTER (WHERE coalesce(is_archived,false)) archived,
       count(*) FILTER (WHERE converted_at IS NOT NULL) converted,
       count(*) FILTER (WHERE coalesce(opt_out,false)) opted_out
FROM lab.leads;

SELECT '--- S1b leads created per month (last 13) ---' AS section;
SELECT to_char(date_trunc('month', created_at),'YYYY-MM') month, count(*) n,
       count(*) FILTER (WHERE converted_at IS NOT NULL) converted
FROM lab.leads WHERE created_at >= now() - interval '13 months'
GROUP BY 1 ORDER BY 1;

SELECT '=== S2 STAGE x HEAT DISTRIBUTION (non-duplicate) ===' AS section;
SELECT stage, heat_level, count(*) n
FROM lab.leads WHERE NOT coalesce(is_duplicate,false)
GROUP BY 1,2 ORDER BY count(*) DESC;

SELECT '--- S2b heat_score NULL among active ---' AS section;
SELECT count(*) FILTER (WHERE heat_score IS NULL) heat_null, count(*) active_total
FROM lab.leads
WHERE NOT coalesce(is_duplicate,false) AND NOT coalesce(is_archived,false)
  AND converted_at IS NULL;

SELECT '=== S3 INVARIANT VIOLATIONS (active = not dup/archived/converted) ===' AS section;
WITH active AS (
  SELECT * FROM lab.leads
  WHERE NOT coalesce(is_duplicate,false) AND NOT coalesce(is_archived,false)
    AND converted_at IS NULL
), open_tasks AS (
  SELECT related_id FROM lab.tasks
  WHERE related_table='leads'
    AND lower(coalesce(status,'')) NOT LIKE '%done%'
    AND lower(coalesce(status,'')) NOT LIKE '%cancel%'
    AND lower(coalesce(status,'')) NOT LIKE '%הושלמ%'
    AND lower(coalesce(status,'')) NOT LIKE '%בוטל%'
  GROUP BY related_id
)
SELECT count(*) active_total,
  count(*) FILTER (WHERE agent_id IS NULL) no_owner,
  count(*) FILTER (WHERE next_followup_at IS NULL
                   AND id NOT IN (SELECT related_id FROM open_tasks)) no_next_step,
  count(*) FILTER (WHERE next_followup_at < now() - interval '7 days') overdue_7d,
  count(*) FILTER (WHERE heat_score IS NULL) heat_null
FROM active;

SELECT '--- S3b no_next_step by stage ---' AS section;
WITH active AS (
  SELECT * FROM lab.leads
  WHERE NOT coalesce(is_duplicate,false) AND NOT coalesce(is_archived,false)
    AND converted_at IS NULL
), open_tasks AS (
  SELECT related_id FROM lab.tasks
  WHERE related_table='leads'
    AND lower(coalesce(status,'')) NOT LIKE '%done%'
    AND lower(coalesce(status,'')) NOT LIKE '%cancel%'
    AND lower(coalesce(status,'')) NOT LIKE '%הושלמ%'
    AND lower(coalesce(status,'')) NOT LIKE '%בוטל%'
  GROUP BY related_id
)
SELECT stage, count(*) n_no_next_step
FROM active
WHERE next_followup_at IS NULL AND id NOT IN (SELECT related_id FROM open_tasks)
GROUP BY 1 ORDER BY 2 DESC;

SELECT '=== S4 RAW DISTRIBUTIONS (for interpretation) ===' AS section;
SELECT 'lead_events.event_type' k, event_type v, count(*) n FROM lab.lead_events GROUP BY 2 ORDER BY 3 DESC LIMIT 25;
SELECT 'lead_events.actor_type' k, actor_type v, count(*) n FROM lab.lead_events GROUP BY 2 ORDER BY 3 DESC;
SELECT 'phone_calls.direction' k, direction v, count(*) n FROM lab.phone_calls GROUP BY 2 ORDER BY 3 DESC;
SELECT 'phone_calls.disposition' k, disposition v, count(*) n FROM lab.phone_calls GROUP BY 2 ORDER BY 3 DESC LIMIT 15;
SELECT 'wa_outbound.status' k, status v, count(*) n FROM lab.wa_outbound GROUP BY 2 ORDER BY 3 DESC;
SELECT 'wa_outbound.action_type' k, action_type v, count(*) n FROM lab.wa_outbound GROUP BY 2 ORDER BY 3 DESC LIMIT 15;
SELECT 'tasks.status' k, status v, count(*) n FROM lab.tasks GROUP BY 2 ORDER BY 3 DESC;
SELECT 'conversation_outcomes.outcome_category' k, outcome_category v, count(*) n FROM lab.conversation_outcomes GROUP BY 2 ORDER BY 3 DESC LIMIT 20;
SELECT 'showings.status' k, status v, count(*) n FROM lab.showings GROUP BY 2 ORDER BY 3 DESC;
SELECT 'showings.outcome' k, outcome v, count(*) n FROM lab.showings GROUP BY 2 ORDER BY 3 DESC;
SELECT 'leads.source(top)' k, source v, count(*) n FROM lab.leads GROUP BY 2 ORDER BY 3 DESC LIMIT 15;
SELECT 'leads.intent' k, intent v, count(*) n FROM lab.leads GROUP BY 2 ORDER BY 3 DESC LIMIT 15;

SELECT '=== S5 JOURNEY — cohort: created last 180d, non-duplicate ===' AS section;
WITH cohort AS (
  SELECT id, phone_hash, source, intent, created_at, converted_at
  FROM lab.leads
  WHERE created_at >= now() - interval '180 days'
    AND NOT coalesce(is_duplicate,false)
),
touch AS (
  SELECT c.id, min(t.ts) first_touch_at
  FROM cohort c
  JOIN LATERAL (
    SELECT pc.starttime ts FROM lab.phone_calls pc
     WHERE (pc.lead_id = c.id OR (c.phone_hash IS NOT NULL AND pc.phone_hash = c.phone_hash))
       AND lower(coalesce(pc.direction,'')) LIKE '%out%'
    UNION ALL
    SELECT o.sent_at FROM lab.wa_outbound o
     WHERE c.phone_hash IS NOT NULL AND o.phone_hash = c.phone_hash AND o.sent_at IS NOT NULL
    UNION ALL
    SELECT co.occurred_at FROM lab.conversation_outcomes co WHERE co.lead_id = c.id
  ) t ON t.ts >= c.created_at
  GROUP BY c.id
),
inbound AS (
  SELECT c.id, min(i.ts) first_inbound_at
  FROM cohort c
  JOIN LATERAL (
    SELECT wi.occurred_at ts FROM lab.wa_inbound wi
     WHERE c.phone_hash IS NOT NULL AND wi.phone_hash = c.phone_hash
    UNION ALL
    SELECT pc.starttime FROM lab.phone_calls pc
     WHERE (pc.lead_id = c.id OR (c.phone_hash IS NOT NULL AND pc.phone_hash = c.phone_hash))
       AND lower(coalesce(pc.direction,'')) LIKE '%in%'
  ) i ON i.ts >= c.created_at
  GROUP BY c.id
),
show AS (
  SELECT c.id, min(s.created_at) booked_at, min(s.scheduled_at) showing_at
  FROM cohort c JOIN lab.showings s ON s.lead_id = c.id OR s.seller_lead_id = c.id
  GROUP BY c.id
)
SELECT
  (SELECT count(*) FROM cohort) leads_created,
  (SELECT count(*) FROM touch) touched,
  (SELECT count(*) FROM inbound) responded,
  (SELECT count(*) FROM show) showing_booked,
  (SELECT count(*) FROM cohort WHERE converted_at IS NOT NULL) converted;

SELECT '--- S5b timing percentiles (hours) ---' AS section;
WITH cohort AS (
  SELECT id, phone_hash, created_at, converted_at FROM lab.leads
  WHERE created_at >= now() - interval '180 days' AND NOT coalesce(is_duplicate,false)
),
touch AS (
  SELECT c.id, c.created_at, min(t.ts) first_touch_at
  FROM cohort c
  JOIN LATERAL (
    SELECT pc.starttime ts FROM lab.phone_calls pc
     WHERE (pc.lead_id = c.id OR (c.phone_hash IS NOT NULL AND pc.phone_hash = c.phone_hash))
       AND lower(coalesce(pc.direction,'')) LIKE '%out%'
    UNION ALL
    SELECT o.sent_at FROM lab.wa_outbound o
     WHERE c.phone_hash IS NOT NULL AND o.phone_hash = c.phone_hash AND o.sent_at IS NOT NULL
    UNION ALL
    SELECT co.occurred_at FROM lab.conversation_outcomes co WHERE co.lead_id = c.id
  ) t ON t.ts >= c.created_at
  GROUP BY c.id, c.created_at
),
show AS (
  SELECT c.id, min(s.created_at) booked_at
  FROM cohort c JOIN lab.showings s ON s.lead_id = c.id OR s.seller_lead_id = c.id
  GROUP BY c.id
)
SELECT 'create->first_touch' leg,
  round(percentile_cont(0.25) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM first_touch_at-created_at)/3600)::numeric,1) p25_h,
  round(percentile_cont(0.5)  WITHIN GROUP (ORDER BY EXTRACT(epoch FROM first_touch_at-created_at)/3600)::numeric,1) p50_h,
  round(percentile_cont(0.75) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM first_touch_at-created_at)/3600)::numeric,1) p75_h,
  round(percentile_cont(0.9)  WITHIN GROUP (ORDER BY EXTRACT(epoch FROM first_touch_at-created_at)/3600)::numeric,1) p90_h,
  count(*) n
FROM touch
UNION ALL
SELECT 'touch->showing_booked',
  round(percentile_cont(0.25) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM s.booked_at-t.first_touch_at)/3600)::numeric,1),
  round(percentile_cont(0.5)  WITHIN GROUP (ORDER BY EXTRACT(epoch FROM s.booked_at-t.first_touch_at)/3600)::numeric,1),
  round(percentile_cont(0.75) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM s.booked_at-t.first_touch_at)/3600)::numeric,1),
  round(percentile_cont(0.9)  WITHIN GROUP (ORDER BY EXTRACT(epoch FROM s.booked_at-t.first_touch_at)/3600)::numeric,1),
  count(*)
FROM touch t JOIN show s ON s.id=t.id AND s.booked_at >= t.first_touch_at
UNION ALL
SELECT 'create->converted',
  round(percentile_cont(0.25) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM c.converted_at-c.created_at)/3600)::numeric,1),
  round(percentile_cont(0.5)  WITHIN GROUP (ORDER BY EXTRACT(epoch FROM c.converted_at-c.created_at)/3600)::numeric,1),
  round(percentile_cont(0.75) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM c.converted_at-c.created_at)/3600)::numeric,1),
  round(percentile_cont(0.9)  WITHIN GROUP (ORDER BY EXTRACT(epoch FROM c.converted_at-c.created_at)/3600)::numeric,1),
  count(*)
FROM cohort c WHERE c.converted_at IS NOT NULL;

SELECT '--- S5c funnel by month (cohort trend, last 8 months) ---' AS section;
WITH cohort AS (
  SELECT id, phone_hash, created_at, converted_at, date_trunc('month',created_at) m
  FROM lab.leads
  WHERE created_at >= now() - interval '8 months' AND NOT coalesce(is_duplicate,false)
),
touch AS (
  SELECT c.id, min(t.ts) first_touch_at FROM cohort c
  JOIN LATERAL (
    SELECT pc.starttime ts FROM lab.phone_calls pc
     WHERE (pc.lead_id=c.id OR (c.phone_hash IS NOT NULL AND pc.phone_hash=c.phone_hash))
       AND lower(coalesce(pc.direction,'')) LIKE '%out%'
    UNION ALL
    SELECT o.sent_at FROM lab.wa_outbound o
     WHERE c.phone_hash IS NOT NULL AND o.phone_hash=c.phone_hash AND o.sent_at IS NOT NULL
    UNION ALL
    SELECT co.occurred_at FROM lab.conversation_outcomes co WHERE co.lead_id=c.id
  ) t ON t.ts >= c.created_at GROUP BY c.id
),
show AS (
  SELECT DISTINCT coalesce(s.lead_id, s.seller_lead_id) id FROM lab.showings s
)
SELECT to_char(c.m,'YYYY-MM') month, count(*) created,
  count(t.id) touched,
  round(100.0*count(t.id)/nullif(count(*),0),1) touched_pct,
  round((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM t.first_touch_at-c.created_at)/3600))::numeric,1) med_h_to_touch,
  count(*) FILTER (WHERE c.id IN (SELECT id FROM show)) with_showing,
  count(*) FILTER (WHERE c.converted_at IS NOT NULL) converted
FROM cohort c LEFT JOIN touch t ON t.id=c.id
GROUP BY c.m ORDER BY 1;

SELECT '--- S5d funnel by source (180d, top 10 sources) ---' AS section;
WITH cohort AS (
  SELECT id, phone_hash, source, created_at, converted_at FROM lab.leads
  WHERE created_at >= now() - interval '180 days' AND NOT coalesce(is_duplicate,false)
),
touch AS (
  SELECT c.id, min(t.ts) first_touch_at FROM cohort c
  JOIN LATERAL (
    SELECT pc.starttime ts FROM lab.phone_calls pc
     WHERE (pc.lead_id=c.id OR (c.phone_hash IS NOT NULL AND pc.phone_hash=c.phone_hash))
       AND lower(coalesce(pc.direction,'')) LIKE '%out%'
    UNION ALL
    SELECT o.sent_at FROM lab.wa_outbound o
     WHERE c.phone_hash IS NOT NULL AND o.phone_hash=c.phone_hash AND o.sent_at IS NOT NULL
    UNION ALL
    SELECT co.occurred_at FROM lab.conversation_outcomes co WHERE co.lead_id=c.id
  ) t ON t.ts >= c.created_at GROUP BY c.id
)
SELECT c.source, count(*) created, count(t.id) touched,
  round(100.0*count(t.id)/nullif(count(*),0),1) touched_pct,
  round((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM t.first_touch_at-c.created_at)/3600))::numeric,1) med_h_to_touch,
  count(*) FILTER (WHERE c.converted_at IS NOT NULL) converted
FROM cohort c LEFT JOIN touch t ON t.id=c.id
GROUP BY c.source ORDER BY count(*) DESC LIMIT 10;

SELECT '=== S6 G1 METRIC — inbound WA answered? (last 90d) ===' AS section;
WITH ib AS (
  SELECT phone_hash, occurred_at FROM lab.wa_inbound
  WHERE occurred_at >= now() - interval '90 days' AND phone_hash IS NOT NULL
),
nxt AS (
  SELECT ib.phone_hash, ib.occurred_at,
    (SELECT min(o.sent_at) FROM lab.wa_outbound o
      WHERE o.phone_hash = ib.phone_hash AND o.sent_at > ib.occurred_at) next_out
  FROM ib
)
SELECT count(*) inbound_msgs,
  count(*) FILTER (WHERE next_out IS NULL) never_answered,
  count(*) FILTER (WHERE next_out - occurred_at > interval '24 hours') answered_over_24h,
  round((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM next_out-occurred_at)/60) FILTER (WHERE next_out IS NOT NULL))::numeric,0) med_minutes_to_reply
FROM nxt;

SELECT '=== DONE ===' AS section;
