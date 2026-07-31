"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type CalEvent = {
  id: string;
  name: string;
  type: string; // VACATION | SICK | PERSONAL
  start: string; // yyyy-mm-dd
  end: string;
};

type CalHoliday = { name: string; date: string };

const TYPE_DOT: Record<string, string> = {
  VACATION: "bg-emerald-500",
  SICK: "bg-orange-400",
  PERSONAL: "bg-violet-400",
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function TeamCalendar({
  events,
  holidays,
}: {
  events: CalEvent[];
  holidays: CalHoliday[];
}) {
  const now = new Date();
  const [month, setMonth] = useState(
    new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)),
  );

  const monthLabel = month.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const firstDow = month.getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const holidayByDate = new Map(holidays.map((h) => [h.date, h.name]));
  const todayStr = ymd(new Date());

  const cells: Array<{ date: string; day: number } | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      date: ymd(new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day))),
      day,
    });
  }

  function eventsOn(date: string): CalEvent[] {
    return events.filter((e) => e.start <= date && date <= e.end);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{monthLabel}</h3>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous month"
            onClick={() =>
              setMonth(
                new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1)),
              )
            }
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next month"
            onClick={() =>
              setMonth(
                new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)),
              )
            }
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-1 font-medium">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) =>
          cell === null ? (
            <div key={`empty-${i}`} />
          ) : (
            <div
              key={cell.date}
              className={cn(
                "min-h-16 rounded-md border p-1 text-xs",
                cell.date === todayStr && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950",
                holidayByDate.has(cell.date) && "bg-sky-50 dark:bg-sky-950",
              )}
            >
              <div className="font-medium">{cell.day}</div>
              {holidayByDate.has(cell.date) && (
                <div className="truncate text-[10px] text-sky-700 dark:text-sky-300">
                  {holidayByDate.get(cell.date)}
                </div>
              )}
              {eventsOn(cell.date)
                .slice(0, 3)
                .map((e) => (
                  <div key={e.id} className="flex items-center gap-1 truncate">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        TYPE_DOT[e.type] ?? "bg-neutral-400",
                      )}
                    />
                    <span className="truncate">{e.name}</span>
                  </div>
                ))}
              {eventsOn(cell.date).length > 3 && (
                <div className="text-[10px] text-muted-foreground">
                  +{eventsOn(cell.date).length - 3} more
                </div>
              )}
            </div>
          ),
        )}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" /> Vacation
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-orange-400" /> Sick
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-violet-400" /> Personal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-sky-400" /> Holiday
        </span>
      </div>
    </div>
  );
}
