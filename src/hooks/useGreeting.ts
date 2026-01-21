import { useMemo } from "react";

interface GreetingResult {
  greeting: string;
  fullGreeting: string;
  firstName: string | null;
  timeOfDay: 'morning' | 'afternoon' | 'evening';
}

export function useGreeting(userName: string | null | undefined): GreetingResult {
  return useMemo(() => {
    const hour = new Date().getHours();
    
    let greeting: string;
    let timeOfDay: 'morning' | 'afternoon' | 'evening';
    
    if (hour < 12) {
      greeting = "Goedemorgen";
      timeOfDay = 'morning';
    } else if (hour < 18) {
      greeting = "Goedemiddag";
      timeOfDay = 'afternoon';
    } else {
      greeting = "Goedenavond";
      timeOfDay = 'evening';
    }

    const firstName = userName?.split(' ')[0]?.trim() || null;
    
    const fullGreeting = firstName 
      ? `${greeting}, ${firstName}` 
      : greeting;

    return { greeting, fullGreeting, firstName, timeOfDay };
  }, [userName]);
}
