# Priority CPA Automation — Project Spec Package

**שם פרויקט (זמני)**: Priority CPA Automation
**שם מותג (לחישוב)**: TBD — הצעות: LedgerPilot, BookFlow, AccountAir, פסקה (Hebrew brand)
**תאריך**: 01/05/2026
**גרסה**: 1.0 — Comprehensive
**Owner**: עוז

---

## מה התיקייה הזו?

חבילת spec **מלאה ומקצועית** המוכנה למסירה ל-Claude Code (או צוות פיתוח אנושי). מכילה:
1. חזון, ניתוח שוק, מודל עסקי
2. UX/UI מפורט מסך-מסך
3. ארכיטקטורה ומפרט מודולים
4. דומיין: כללי הנהלת חשבונות ישראלית, MOVEIN.DAT
5. Implementation roadmap + skills + Claude Code prompts
6. Operations: security, compliance, monitoring
7. POC artifacts (קוד שעבד + דוגמאות חשבוניות)

---

## איך להשתמש בתיקייה הזו

### לפיתוח עם Claude Code
1. פתח Claude Code מקומית
2. תן לו גישה לתיקייה הזו
3. השתמש בpromp הראשון מ-`06_implementation/claude_code_prompts/handoff_initial.md`
4. עקוב אחרי `06_implementation/phase_1_mvp.md` כ-roadmap

### לסקירה אנושית (משקיעים, פרטנרים)
- התחל מ-`01_executive/vision.md`
- המשך ל-`01_executive/market_analysis.md`
- צפה ב-`03_design/ui_screens/` להמחשת המוצר

### למפתח שמצטרף
- קרא הכל בסדר 01 → 08
- POC artifacts ב-08 הם code references מאומתים

---

## מבנה התיקייה

```
priority-cpa-automation-spec/
├── README.md                         ← אתה כאן
├── CLAUDE.md                         ← System prompt ל-Claude Code (רוט)
│
├── 01_executive/                     ← למייסדים ומשקיעים
│   ├── vision.md
│   ├── market_analysis.md           ← מתחרים, פערים, positioning
│   ├── business_model.md            ← תמחור, GTM, KPIs
│   └── decisions_log.md             ← החלטות נעולות
│
├── 02_product/                       ← מה אנחנו בונים
│   ├── personas.md                  ← 4 פרסונות מפורטות
│   ├── user_journeys.md             ← End-to-end flows
│   ├── feature_matrix.md            ← Must / Should / Could
│   └── 360_areas.md                 ← הכל-כולל-הכל, גם מה שלא חשבת
│
├── 03_design/                        ← UX/UI מפורט
│   ├── design_system.md             ← Colors, typography, components
│   ├── ux_principles.md
│   ├── mobile_considerations.md
│   └── ui_screens/                  ← מסך-מסך
│       ├── 01_auth_onboarding.md
│       ├── 02_dashboard.md
│       ├── 03_invoice_queue.md
│       ├── 04_je_editor.md
│       ├── 05_settings.md
│       ├── 06_setup_wizard.md
│       └── 07_reports_analytics.md
│
├── 04_architecture/                  ← איך זה עובד טכנית
│   ├── strategic_spec.md            ← המסמך האסטרטגי המלא
│   ├── system_diagram.md            ← Component-level
│   ├── modules_engines.md           ← 16 מנועים מפורטים
│   ├── data_model.md                ← Supabase schema
│   ├── tech_stack.md
│   └── integrations.md
│
├── 05_domain/                        ← Knowledge base חשבונאי
│   ├── je_scenarios_playbook.md     ← 12 תרחישי JE
│   ├── movein_format_spec.md
│   ├── israeli_accounting_rules.md
│   └── glossary.md
│
├── 06_implementation/                ← Build instructions
│   ├── phase_1_mvp.md
│   ├── phase_2_beta.md
│   ├── phase_3_v1.md
│   ├── skills_to_build.md           ← 10 skills
│   └── claude_code_prompts/
│       ├── handoff_initial.md       ← Prompt ראשון לתת ל-Claude
│       ├── per_skill_prompts.md     ← Prompt לכל skill
│       └── code_review_checklist.md
│
├── 07_operations/                    ← Production concerns
│   ├── security.md
│   ├── compliance.md                ← Israeli law, GDPR, PCI
│   ├── monitoring.md
│   └── support.md
│
└── 08_poc_artifacts/                 ← מה הוכח שעובד
    ├── poc_summary.md
    ├── lessons_learned.md
    ├── generate_movein.py           ← הסקריפט שעבד
    ├── movein_working.dat            ← הקובץ שנטען נקי לפריוריטי
    └── invoice_examples/
        ├── wertheim_4427930.pdf
        ├── wertheim_4427930.json
        ├── tzarfati_114390.pdf
        └── tzarfati_114390.json
```

---

## הסטטוס הנוכחי

✅ POC נסגר. MOVEIN.DAT 180-char נטען נקי לפריוריטי דרך תפריט "טעינה מתוכנות אחרות".

🎯 הצעד הבא: **Phase 1 — MVP** ב-Claude Code לפי `06_implementation/phase_1_mvp.md`.

---

## פרטי קשר

- בעלים: עוז (oz@oz-nihul.com)
- חברת פיילוט: טארי פתרונות מעוצבים בע"מ (ע.מ 517049003)
- רו"ח פיילוט: שני
