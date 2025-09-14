'use client';

import { useEffect, useState } from 'react';
import { Checkbox } from '../../components/ui/checkbox';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Calendar } from 'lucide-react';
import { CalendarStatus } from '../../components/CalendarStatus';

type GCalendar = {
  id: string;
  summary: string;
  primary?: boolean;
  selected?: boolean;
  timeZone?: string;
};


export default function CalendarSettings() {
  const [calendars, setCalendars] = useState<GCalendar[]>([]);
  const [selectedCalIds, setSelectedCalIds] = useState<string[]>([]);
  const [calendarId, setCalendarId] = useState<string>('primary');
  const [useUnion, setUseUnion] = useState(false);
  const [, setLoading] = useState(true);

  useEffect(() => {
    // Load persisted preferences
    try {
      const savedUnion = localStorage.getItem('cal_union');
      if (savedUnion === '1') setUseUnion(true);
      const savedSel = localStorage.getItem('cal_selected');
      if (savedSel) setSelectedCalIds(JSON.parse(savedSel));
      const savedBook = localStorage.getItem('cal_book');
      if (savedBook) setCalendarId(savedBook);
    } catch {
    // Error handled silently
  }

    // Fetch calendar list
    fetch('/api/calendar/list')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j?.calendars) return;
        const cals = j.calendars as GCalendar[];
        setCalendars(cals);
        
        // Auto-select primary calendar if not already selected
        const primary = cals.find((c) => c.primary);
        if (primary && !selectedCalIds.length) {
          setSelectedCalIds([primary.id]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try { 
      localStorage.setItem('cal_union', useUnion ? '1' : '0');
    } catch {
    // Error handled silently
  }
  }, [useUnion]);

  useEffect(() => {
    try { 
      localStorage.setItem('cal_selected', JSON.stringify(selectedCalIds));
    } catch {
    // Error handled silently
  }
  }, [selectedCalIds]);

  useEffect(() => {
    try { 
      localStorage.setItem('cal_book', calendarId);
    } catch {
    // Error handled silently
  }
  }, [calendarId]);

  return (
    <div className="space-y-6">
      {/* Google Calendar Status */}
      <section className="bg-gray-900/50 p-6 rounded-lg border border-gray-800">
        <h3 className="text-lg font-semibold mb-4 text-white">Google Calendar Integration</h3>
        <p className="text-sm text-gray-400 mb-4">
          Connect your Google Calendar to enable scheduling and availability checking.
        </p>
        <CalendarStatus />
      </section>

      {/* Calendar Configuration */}
      {calendars.length > 0 && (
        <section className="bg-gray-900/50 p-6 rounded-lg border border-gray-800">
          <h3 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Calendar Configuration
          </h3>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Calendars to check for availability</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {calendars.map((c) => (
                  <div key={c.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`cal-${c.id}`}
                      checked={selectedCalIds.includes(c.id)}
                      onCheckedChange={(checked) => {
                        setSelectedCalIds((prev) => {
                          const next = checked 
                            ? Array.from(new Set([...prev, c.id])) 
                            : prev.filter((x) => x !== c.id);
                          return next;
                        });
                      }}
                    />
                    <Label 
                      htmlFor={`cal-${c.id}`} 
                      className="text-sm font-normal cursor-pointer text-gray-300"
                    >
                      {c.summary} {c.primary && <Badge variant="outline" className="ml-1">Primary</Badge>}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="use-union"
                checked={useUnion}
                onCheckedChange={(checked) => setUseUnion(checked as boolean)}
              />
              <Label htmlFor="use-union" className="cursor-pointer text-gray-300">
                Use selected calendars for availability checking
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="book-calendar" className="text-gray-300">Book appointments on</Label>
              <Select value={calendarId} onValueChange={setCalendarId}>
                <SelectTrigger id="book-calendar" className="bg-gray-800 border-gray-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {calendars.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.summary}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}