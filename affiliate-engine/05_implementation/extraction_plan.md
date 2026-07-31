# Extraction Plan — חיתוך לריפו נפרד

התיקייה `affiliate-engine/` תוכננה מהיום הראשון להיות עצמאית. אם עוז ירצה ריפו נפרד — זו עבודה של שעה, לא של שבוע.

---

## למה זה בכלל בתוך הריפו של Priority CPA

**נימוק**: בשלב אפיון, ריפו נפרד מייצר חיכוך — שני חלונות, שני CI, שני מקומות לחפש בהם. כל עוד אין קוד פרודקשן ואין CI נפרד, ישיבה בתת-תיקייה זולה יותר.

**מתי לחתוך**: כשמתקיים אחד מאלה —
1. יש משתמש חיצוני ראשון
2. נדרש CI/deployment נפרד עם secrets משלו
3. עוז רוצה לגייס שותף לפרויקט הזה בלבד
4. הריפו האב עובר ל-open source או לרוכש

---

## מה כבר עצמאי

| רכיב | סטטוס |
|---|---|
| `code/package.json` | npm workspace נפרד לגמרי |
| `code/tsconfig.base.json` | תצורת TS משלו |
| חבילות `@affiliate/*` | אפס import מ-`@priority-cpa/*` |
| `code/supabase/migrations/` | סכמה עצמאית, ללא הצלבה לטבלאות האב |
| מסמכי אפיון | ללא הפניות פנימיות לתיקיות האב |

**התלות היחידה שנשקלה במכוון**: `boi-rates` (שערי בנק ישראל) קיים בפרויקט האב. אם נדרש — **להעתיק, לא לייבא**. תלות חוצת-פרויקטים תבטל את העצמאות.

---

## הרצת החיתוך

```bash
# 1. שמירת ההיסטוריה של התיקייה בלבד
git subtree split --prefix=affiliate-engine -b affiliate-only

# 2. ריפו חדש
mkdir ../affiliate-engine && cd ../affiliate-engine && git init
git pull ../priority-cpa-automation affiliate-only

# 3. העלאת התוכן רמה אחת (code/ → שורש), עדכון נתיבים ב-package.json
# 4. העתקת .gitignore מהאב
# 5. יצירת ריפו ב-GitHub ודחיפה
```

---

## checklist אחרי החיתוך

- [ ] `npm install && npm test` עובר בריפו החדש
- [ ] `npm run typecheck` עובר
- [ ] CLAUDE.md מותאם — הפניות ל"פרויקט האב" מוסרות או מעודכנות
- [ ] פרויקט Supabase נפרד (לא לחלוק DB עם Priority CPA)
- [ ] פרויקט Vercel נפרד
- [ ] `affiliate-engine/` נמחקת מהריפו האב, עם commit שמפנה לריפו החדש
