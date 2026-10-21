# EDUWAY Admin Portal

Operations console for **EDUWAY**, the bilingual (English / Arabic RTL) e-learning platform for Iraqi 6th Scientific Grade students.

> **Mock frontend.** There is no backend. All data is deterministic mock data in `src/data`, held in Zustand stores in `src/store`. Every create / edit / delete / approve action updates the UI immediately and writes an entry to the audit log (**Security → Audit Logs**). Refreshing the page resets the data. Only your session, language, theme and sidebar state are kept in browser storage.

## Quick start

```bash
cd website/admin
npm install
npm run dev        # http://localhost:5174
```

| Script            | What it does                          |
| ----------------- | ------------------------------------- |
| `npm run dev`     | Vite dev server on port 5174          |
| `npm run build`   | Type-check (`tsc -b`) + production build to `dist/` |
| `npm run preview` | Serve the production build (port 4174) |
| `npm run lint`    | ESLint                                |
| `npm run format`  | Prettier (with Tailwind class sorting) |

### Demo sign-in

| Field    | Value             |
| -------- | ----------------- |
| Email    | `admin@eduway.iq` |
| Password | `Admin@123`       |
| 2FA code | `123456`          |

The other seeded admins (e.g. `huda.kareem@eduway.iq`, `sami.hashimi@eduway.iq`, `mariam.abbas@eduway.iq`) also sign in with the same password and 2FA code. Each one has a different role.

**Role preview (dev helper):** open the avatar menu (top right) and choose **Preview portal as…** to switch between Super Admin, Finance Admin, Academic Supervisor, Content Teacher and Support. The sidebar, route guards and action buttons update to match that role's permission matrix. You can edit the matrix under **Security → Roles**.

## Stack

React 18 · Vite 5 · TypeScript (strict) · React Router 6 · Tailwind CSS 3 · Framer Motion · lucide-react · i18next / react-i18next · react-hook-form + zod · Zustand · @tanstack/react-table · Recharts · @dnd-kit · react-hot-toast · react-helmet-async · date-fns · KaTeX

## Project structure

```
src/
  components/
    layout/   Sidebar, Topbar, Breadcrumbs, PageHeader, LanguageSwitcher, CommandPalette, AppLayout
    ui/       Button, Card, Badge, Modal/Drawer, Input/Select/Textarea, Switch/Checkbox, Tabs, DataTable,
              Pagination, StatCard/KpiTrend/Sparkline, EmptyState, Skeleton, ConfirmDialog, FileUpload,
              DateRangePicker, Latex, TagInput, Menu/Popover, Avatar
    charts/   AreaChart, BarChart, LineChart, DonutChart (theme- and RTL-aware Recharts wrappers)
    forms/    LessonForm, QuestionForm, PackageForm, SchoolForm, MarketerForm, IncentiveRuleForm, RoleForm
  pages/      one folder per module (see routes/index.tsx)
  data/       mock datasets (students, curriculum, transactions, questions, …)
  store/      Zustand stores; createCollection.ts = generic CRUD store with audit logging
  i18n/       en.json / ar.json (shared strings) + modules/<module>.<lang>.json (per-module strings)
  routes/     router, navigation config (nav.ts) and auth/permission guards
  hooks/  utils/  styles/  types/
```

### Conventions

- **Navigation** comes from one source, `src/routes/nav.ts`. It drives the sidebar, the ⌘K / Ctrl+K command palette, the breadcrumbs, and the permission filtering.
- **Permissions:** use `useCan()(module, action)` or `<Can module action>` to show or hide actions. Every route is wrapped in `RequirePermission`.
- **Data changes** go through the store APIs (`add`, `update`, `remove`, `updateMany`, …) from `createCollection`. These write the audit trail automatically. Pass `{ action, summary }` to give the log entry a meaningful name.
- **Bilingual fields** use the `_en` / `_ar` suffixes. Read them with `useLocalize()`: `L(subject, 'name')`.
- **Strings:** all UI text goes through i18next. Module strings live in `src/i18n/modules/<module>.en.json` and `<module>.ar.json`. They are merged under the `<module>` key automatically.
- **RTL:** use logical Tailwind utilities (`ms-*`, `pe-*`, `start-*`, `end-*`). Add `flip-rtl` to directional icons.
- **Theming:** colors are CSS variables in `src/styles/globals.css`. Light and dark values switch on `<html data-theme>`.

## Environment

Copy `.env.example` to `.env`. The variables are placeholders for when real APIs are connected. The mock build does not read the API URL.
