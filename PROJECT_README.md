# Morakaba - سيناريو جديد من الصفر

## فرقة البحث و الوقاية | Research & Prevention Team

### 🎯 رؤية المشروع

تطبيق موبايل احترافي وعصري مع جودة وسلاسة مثل Telegram، مصمم خصيصاً لـ Morakaba بهوية رسمية وأمنية.

---

## 📁 بنية المشروع

```
morakaba/
├── app/                          # Navigation & Screens (Expo Router)
│   ├── (auth)/                   # Authentication Flow
│   │   ├── splash.tsx           # Splash screen
│   │   ├── login.tsx            # Login screen
│   │   └── waiting-approval.tsx # Pending approval state
│   │
│   ├── (app)/                    # Main App (After Auth)
│   │   ├── admin/               # Admin Dashboard
│   │   ├── member/              # Member Dashboard
│   │   └── _layout.tsx          # Role-based routing
│   │
│   ├── _layout.tsx              # Root layout
│   └── ...
│
├── src/
│   ├── theme/                    # Design System
│   │   ├── colors.ts            # Color palette (Primary, Secondary, Semantic)
│   │   ├── typography.ts        # Font sizes & weights
│   │   ├── spacing.ts           # Spacing scale & sizing
│   │   ├── animations.ts        # Animation configs
│   │   └── index.ts             # Theme exports
│   │
│   ├── store/                    # Zustand Stores
│   │   ├── auth.store.ts        # Auth state management
│   │   └── index.ts
│   │
│   ├── hooks/                    # Custom Hooks
│   │   ├── useAuth.ts
│   │   └── index.ts
│   │
│   ├── services/                 # API & Backend
│   │   ├── supabase/
│   │   │   ├── client.ts        # Supabase client
│   │   │   └── auth.service.ts  # Auth methods
│   │   └── api/
│   │
│   ├── models/                   # TypeScript Interfaces
│   │   └── index.ts             # User, Role, Employee models
│   │
│   ├── components/               # Reusable Components
│   │   ├── ui/                  # Basic UI components
│   │   ├── layouts/             # Screen layouts
│   │   └── common/              # Common components
│   │
│   ├── constants/                # App Constants
│   │   └── config.ts            # Feature flags, timeouts, etc.
│   │
│   ├── utils/                    # Utility Functions
│   │   ├── validation.ts
│   │   └── formatting.ts
│   │
│   └── locales/                  # i18n
│       └── ar.json              # Arabic translations
│
└── .env.example                  # Environment variables template
```

---

## 🎨 Design System

### Color Palette

- **Primary**: Deep Blue (#3B5BDB) - Professional & Secure
- **Secondary**: Cyan (#06B6D4) - Modern & Positive
- **Semantic**: Success, Warning, Error colors
- **Neutral**: Complete grayscale for UI

### Typography

- Arabic-first support (Cairo font)
- Clean, professional font hierarchy
- RTL-optimized sizing

### Spacing

- Mobile-first with 48px+ touch targets
- Comfortable thumb zones
- Safe area padding built-in

### Animations

- iOS-like spring configs
- Quick (150ms), Standard (300ms), Slow (500ms)
- Smooth transitions & touch feedback

---

## 🔐 Authentication Flow

```
┌─ Splash Screen (2s)
│
├─ Auth State Check
│  ├─ Session Active? → App (Admin/Member)
│  ├─ Pending? → Waiting Approval
│  └─ None? → Login
│
└─ Role-Based Routing
   ├─ Admin → Admin Dashboard
   └─ Member → Member Dashboard
```

---

## 🔧 Tech Stack

- **Framework**: React Native + Expo
- **Navigation**: Expo Router (App Directory)
- **State Management**: Zustand (lightweight & simple)
- **Backend**: Supabase (Auth + Database)
- **Animations**: React Native Reanimated 3
- **Data Fetching**: TanStack Query
- **i18n**: i18next (Arabic + English)

---

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Create `.env.local`

```
EXPO_PUBLIC_SUPABASE_URL=<your-url>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-key>
EXPO_PUBLIC_APP_ENV=development
```

### 3. Create Supabase Tables

See `supabase/migrations/` for schema

### 4. Start Development

```bash
npx expo start
```

---

## ✅ Phase 1 Complete

- ✅ Project structure created
- ✅ Theme system with Morakaba identity
- ✅ Auth flow (Splash → Login → Waiting Approval)
- ✅ Store setup (Zustand)
- ✅ Models & Types
- ✅ Basic navigation structure
- ✅ Admin & Member dashboard shells

---

## 📋 Next Phases

### Phase 2: Core Components

- Buttons, Cards, Inputs (with polish)
- Loading placeholders
- Empty & Error states

### Phase 3: Features

- Real dashboard content
- Admin management features
- Member task management
- Real-time updates via Supabase

### Phase 4: Polish

- Smooth animations
- Optimized performance
- Offline support
- Push notifications

---

## 📱 Key Features

- **Mobile-First**: iOS & Android only
- **Smooth & Fast**: Telegram-level UX
- **RTL Support**: Full Arabic support
- **Dark Mode Ready**: Theme system ready
- **Type-Safe**: Full TypeScript
- **Scalable**: Clean architecture

---

## 🎯 Design Philosophy

1. **Professional**: Formal, secure appearance
2. **Modern**: Contemporary design patterns
3. **Performant**: Smooth, responsive interactions
4. **Accessible**: Proper spacing & touch targets
5. **Consistent**: Design system-driven

---

## 📞 Support

For issues or questions about the project structure, check the inline documentation in each file.

---

**Created**: March 24, 2026
**Status**: Phase 1 Complete - Ready for Phase 2
