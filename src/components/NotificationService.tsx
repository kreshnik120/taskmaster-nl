import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ReminderNotification } from "./ReminderNotification";

interface Reminder {
  id: string;
  title: string | null;
  at: string;
  task_id: string;
  subtask_id: string | null;
  channel: string;
  repeat_interval: string | null;
}

export const NotificationService = () => {
  const [activeReminders, setActiveReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    // Request notification permission
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    // Check for due reminders every 30 seconds
    const checkReminders = async () => {
      const now = new Date();
      const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

      const { data: dueReminders, error } = await supabase
        .from("reminders")
        .select("*")
        .is("shown_at", null)
        .lte("at", now.toISOString())
        .gte("at", twoMinutesAgo.toISOString())
        .eq("channel", "IN_APP");

      if (error) {
        console.error("Error fetching reminders:", error);
        return;
      }

      if (dueReminders && dueReminders.length > 0) {
        setActiveReminders((prev) => {
          const newReminders = dueReminders.filter(
            (reminder) => !prev.some((r) => r.id === reminder.id)
          );
          return [...prev, ...newReminders];
        });

        // Show browser notification
        dueReminders.forEach((reminder) => {
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification(reminder.title || "Herinnering", {
              body: `Herinnering voor taak`,
              icon: "/favicon.ico",
              tag: reminder.id,
            });
          }
        });
      }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 30000);

    // Listen for new reminders
    const channel = supabase
      .channel("reminders-notifications")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reminders",
        },
        () => {
          checkReminders();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const handleClose = async (reminderId: string) => {
    // Mark reminder as shown
    await supabase
      .from("reminders")
      .update({ shown_at: new Date().toISOString() })
      .eq("id", reminderId);

    setActiveReminders((prev) => prev.filter((r) => r.id !== reminderId));
  };

  const handleSnooze = async (reminderId: string, minutes: number) => {
    const reminder = activeReminders.find((r) => r.id === reminderId);
    if (!reminder) return;

    // Mark current reminder as shown
    await supabase
      .from("reminders")
      .update({ shown_at: new Date().toISOString() })
      .eq("id", reminderId);

    // Create new snoozed reminder
    const snoozeTime = new Date(Date.now() + minutes * 60 * 1000);
    await supabase.from("reminders").insert({
      task_id: reminder.task_id,
      subtask_id: reminder.subtask_id || null,
      title: reminder.title || null,
      at: snoozeTime.toISOString(),
      channel: reminder.channel as "IN_APP" | "EMAIL",
      repeat_interval: "NONE",
    });

    setActiveReminders((prev) => prev.filter((r) => r.id !== reminderId));
  };

  const handleRecurring = async (reminder: Reminder) => {
    if (!reminder.repeat_interval || reminder.repeat_interval === "NONE") return;

    const currentDate = new Date(reminder.at);
    let nextDate = new Date(currentDate);

    switch (reminder.repeat_interval) {
      case "DAILY":
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case "WEEKLY":
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case "MONTHLY":
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
    }

    await supabase.from("reminders").insert({
      task_id: reminder.task_id,
      subtask_id: reminder.subtask_id || null,
      title: reminder.title || null,
      at: nextDate.toISOString(),
      channel: reminder.channel as "IN_APP" | "EMAIL",
      repeat_interval: reminder.repeat_interval || null,
    });
  };

  return (
    <>
      {activeReminders.map((reminder) => (
        <ReminderNotification
          key={reminder.id}
          reminder={reminder}
          onClose={async () => {
            await handleRecurring(reminder);
            await handleClose(reminder.id);
          }}
          onSnooze={(minutes) => handleSnooze(reminder.id, minutes)}
        />
      ))}
    </>
  );
};
