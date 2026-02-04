import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
        toast:
            "group toast group-[.toaster]:bg-white/90 dark:group-[.toaster]:bg-slate-900/90 group-[.toaster]:backdrop-blur-2xl group-[.toaster]:border-white/40 dark:group-[.toaster]:border-white/15 group-[.toaster]:shadow-[0_8px_32px_rgba(0,0,0,0.12)] group-[.toaster]:text-foreground group-[.toaster]:rounded-xl",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:shadow-[0_2px_8px_hsla(221,83%,53%,0.25)]",
          cancelButton: "group-[.toast]:bg-white/60 dark:group-[.toast]:bg-slate-800/60 group-[.toast]:backdrop-blur-sm group-[.toast]:text-muted-foreground group-[.toast]:border-white/30",
          success: "group-[.toaster]:border-green-500/30 group-[.toaster]:shadow-[0_10px_40px_-10px_hsla(142,71%,45%,0.15),0_4px_16px_hsla(142,71%,45%,0.1)]",
          error: "group-[.toaster]:border-destructive/30 group-[.toaster]:shadow-[0_10px_40px_-10px_hsla(0,84%,60%,0.15),0_4px_16px_hsla(0,84%,60%,0.1)]",
          warning: "group-[.toaster]:border-orange-500/30 group-[.toaster]:shadow-[0_10px_40px_-10px_hsla(24,95%,53%,0.15),0_4px_16px_hsla(24,95%,53%,0.1)]",
          info: "group-[.toaster]:border-primary/30 group-[.toaster]:shadow-[0_10px_40px_-10px_hsla(221,83%,53%,0.15),0_4px_16px_hsla(221,83%,53%,0.1)]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
