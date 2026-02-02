import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        priority: {
          low: "hsl(var(--priority-low))",
          medium: "hsl(var(--priority-medium))",
          high: "hsl(var(--priority-high))",
          critical: "hsl(var(--priority-critical))",
        },
        status: {
          backlog: "hsl(var(--status-backlog))",
          ready: "hsl(var(--status-ready))",
          doing: "hsl(var(--status-doing))",
          blocked: "hsl(var(--status-blocked))",
          review: "hsl(var(--status-review))",
          done: "hsl(var(--status-done))",
        },
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
        info: "hsl(var(--info))",
        error: "hsl(var(--error))",
        kpi: {
          count: "hsl(var(--kpi-count))",
          success: "hsl(var(--kpi-success))",
          time: "hsl(var(--kpi-time))",
          urgent: "hsl(var(--kpi-urgent))",
        },
        recruitment: {
          nieuw: "hsl(var(--recruitment-nieuw))",
          screening: "hsl(var(--recruitment-screening))",
          interview: "hsl(var(--recruitment-interview))",
          goedgekeurd: "hsl(var(--recruitment-goedgekeurd))",
          geplaatst: "hsl(var(--recruitment-geplaatst))",
          afgewezen: "hsl(var(--recruitment-afgewezen))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        tab: {
          "mijn-werk": {
            50: "hsl(var(--tab-mijn-werk-50))",
            100: "hsl(var(--tab-mijn-werk-100))",
            200: "hsl(var(--tab-mijn-werk-200))",
            300: "hsl(var(--tab-mijn-werk-300))",
            400: "hsl(var(--tab-mijn-werk-400))",
            500: "hsl(var(--tab-mijn-werk-500))",
            600: "hsl(var(--tab-mijn-werk-600))",
            700: "hsl(var(--tab-mijn-werk-700))",
            800: "hsl(var(--tab-mijn-werk-800))",
            900: "hsl(var(--tab-mijn-werk-900))",
            DEFAULT: "hsl(var(--tab-mijn-werk-500))",
          },
          kalender: {
            50: "hsl(var(--tab-kalender-50))",
            100: "hsl(var(--tab-kalender-100))",
            200: "hsl(var(--tab-kalender-200))",
            300: "hsl(var(--tab-kalender-300))",
            400: "hsl(var(--tab-kalender-400))",
            500: "hsl(var(--tab-kalender-500))",
            600: "hsl(var(--tab-kalender-600))",
            700: "hsl(var(--tab-kalender-700))",
            800: "hsl(var(--tab-kalender-800))",
            900: "hsl(var(--tab-kalender-900))",
            DEFAULT: "hsl(var(--tab-kalender-500))",
          },
          lijst: {
            50: "hsl(var(--tab-lijst-50))",
            100: "hsl(var(--tab-lijst-100))",
            200: "hsl(var(--tab-lijst-200))",
            300: "hsl(var(--tab-lijst-300))",
            400: "hsl(var(--tab-lijst-400))",
            500: "hsl(var(--tab-lijst-500))",
            600: "hsl(var(--tab-lijst-600))",
            700: "hsl(var(--tab-lijst-700))",
            800: "hsl(var(--tab-lijst-800))",
            900: "hsl(var(--tab-lijst-900))",
            DEFAULT: "hsl(var(--tab-lijst-500))",
          },
          opvolging: {
            50: "hsl(var(--tab-opvolging-50))",
            100: "hsl(var(--tab-opvolging-100))",
            200: "hsl(var(--tab-opvolging-200))",
            300: "hsl(var(--tab-opvolging-300))",
            400: "hsl(var(--tab-opvolging-400))",
            500: "hsl(var(--tab-opvolging-500))",
            600: "hsl(var(--tab-opvolging-600))",
            700: "hsl(var(--tab-opvolging-700))",
            800: "hsl(var(--tab-opvolging-800))",
            900: "hsl(var(--tab-opvolging-900))",
            DEFAULT: "hsl(var(--tab-opvolging-500))",
          },
          team: {
            50: "hsl(var(--tab-team-50))",
            100: "hsl(var(--tab-team-100))",
            200: "hsl(var(--tab-team-200))",
            300: "hsl(var(--tab-team-300))",
            400: "hsl(var(--tab-team-400))",
            500: "hsl(var(--tab-team-500))",
            600: "hsl(var(--tab-team-600))",
            700: "hsl(var(--tab-team-700))",
            800: "hsl(var(--tab-team-800))",
            900: "hsl(var(--tab-team-900))",
            DEFAULT: "hsl(var(--tab-team-500))",
          },
          recruitment: {
            50: "hsl(var(--tab-recruitment-50))",
            100: "hsl(var(--tab-recruitment-100))",
            200: "hsl(var(--tab-recruitment-200))",
            300: "hsl(var(--tab-recruitment-300))",
            400: "hsl(var(--tab-recruitment-400))",
            500: "hsl(var(--tab-recruitment-500))",
            600: "hsl(var(--tab-recruitment-600))",
            700: "hsl(var(--tab-recruitment-700))",
            800: "hsl(var(--tab-recruitment-800))",
            900: "hsl(var(--tab-recruitment-900))",
            DEFAULT: "hsl(var(--tab-recruitment-500))",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "complete-slide-up": {
          "0%": { 
            opacity: "1", 
            transform: "translateY(0) scale(1)" 
          },
          "50%": { 
            opacity: "0.7", 
            transform: "translateY(-4px) scale(0.98)"
          },
          "100%": { 
            opacity: "0", 
            transform: "translateY(-8px) scale(0.96)" 
          }
        },
        "check-pop": {
          "0%": { transform: "scale(0)", opacity: "0" },
          "50%": { transform: "scale(1.2)" },
          "100%": { transform: "scale(1)", opacity: "1" }
        },
        "message-send": {
          "0%": { 
            opacity: "0", 
            transform: "scale(0.95) translateY(10px)" 
          },
          "100%": { 
            opacity: "1", 
            transform: "scale(1) translateY(0)" 
          }
        },
        "message-receive": {
          "0%": { 
            opacity: "0", 
            transform: "translateY(20px)" 
          },
          "100%": { 
            opacity: "1", 
            transform: "translateY(0)" 
          }
        },
        "pulse-once": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" }
        },
        "badge-pop": {
          "0%": { transform: "scale(0)" },
          "50%": { transform: "scale(1.15)" },
          "100%": { transform: "scale(1)" }
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "complete-slide-up": "complete-slide-up 0.4s ease-out forwards",
        "check-pop": "check-pop 0.3s ease-out",
        "message-send": "message-send 0.2s ease-out",
        "message-receive": "message-receive 0.3s ease-out",
        "pulse-once": "pulse-once 0.5s ease-in-out",
        "badge-pop": "badge-pop 0.3s ease-out",
      },
      boxShadow: {
        "tab-mijn-werk": "0 2px 4px -1px hsla(234, 45%, 52%, 0.06), 0 4px 8px -2px hsla(234, 45%, 52%, 0.08)",
        "tab-kalender": "0 2px 4px -1px hsla(174, 42%, 43%, 0.06), 0 4px 8px -2px hsla(174, 42%, 43%, 0.08)",
        "tab-lijst": "0 2px 4px -1px hsla(215, 25%, 48%, 0.04), 0 4px 8px -2px hsla(215, 25%, 48%, 0.06)",
        "tab-opvolging": "0 2px 4px -1px hsla(38, 55%, 50%, 0.06), 0 4px 8px -2px hsla(38, 55%, 50%, 0.08)",
        "tab-team": "0 2px 4px -1px hsla(270, 45%, 55%, 0.06), 0 4px 8px -2px hsla(270, 45%, 55%, 0.08)",
        "tab-recruitment": "0 2px 4px -1px hsla(345, 48%, 52%, 0.06), 0 4px 8px -2px hsla(345, 48%, 52%, 0.08)",
      },
      transitionTimingFunction: {
        "spring-soft": "cubic-bezier(0.22, 1.2, 0.36, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
