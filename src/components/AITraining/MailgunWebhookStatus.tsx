import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Mail, MousePointerClick, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface EmailEvent {
  id: string;
  event_type: string;
  message_id: string;
  recipient: string;
  timestamp: string;
  metadata: any;
  created_at: string;
}

interface EmailStats {
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
  complaint_rate: number;
}

const EVENT_TYPE_ICONS: Record<string, any> = {
  delivered: CheckCircle2,
  opened: Mail,
  clicked: MousePointerClick,
  permanent_fail: XCircle,
  temporary_fail: AlertTriangle,
  complained: XCircle,
  unsubscribed: XCircle,
};

export function MailgunWebhookStatus() {
  const { toast } = useToast();
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [events, setEvents] = useState<EmailEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<EmailEvent[]>([]);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [timeRange, setTimeRange] = useState("24h");
  const [stats, setStats] = useState<EmailStats>({
    delivery_rate: 0,
    open_rate: 0,
    click_rate: 0,
    bounce_rate: 0,
    complaint_rate: 0,
  });

  // Fetch events
  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from("email_events")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Error fetching events:", error);
      return;
    }

    setEvents(data || []);
    setIsConfigured(data && data.length > 0);
  };

  // Calculate stats
  const calculateStats = () => {
    if (events.length === 0) return;

    const now = Date.now();
    const timeRanges: Record<string, number> = {
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };

    const filteredByTime = events.filter(
      (e) => now - new Date(e.timestamp).getTime() < timeRanges[timeRange]
    );

    const delivered = filteredByTime.filter((e) => e.event_type === "delivered").length;
    const opened = filteredByTime.filter((e) => e.event_type === "opened").length;
    const clicked = filteredByTime.filter((e) => e.event_type === "clicked").length;
    const failed = filteredByTime.filter(
      (e) => e.event_type === "permanent_fail" || e.event_type === "temporary_fail"
    ).length;
    const complained = filteredByTime.filter((e) => e.event_type === "complained").length;
    const total = filteredByTime.length || 1;

    setStats({
      delivery_rate: delivered > 0 ? (delivered / total) * 100 : 0,
      open_rate: delivered > 0 ? (opened / delivered) * 100 : 0,
      click_rate: delivered > 0 ? (clicked / delivered) * 100 : 0,
      bounce_rate: (failed / total) * 100,
      complaint_rate: delivered > 0 ? (complained / delivered) * 100 : 0,
    });
  };

  // Filter events
  useEffect(() => {
    let filtered = events;

    if (filterType !== "all") {
      filtered = filtered.filter((e) => e.event_type === filterType);
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (e) =>
          e.recipient.toLowerCase().includes(searchTerm.toLowerCase()) ||
          e.message_id.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredEvents(filtered);
  }, [events, filterType, searchTerm]);

  // Calculate stats when time range or events change
  useEffect(() => {
    calculateStats();
  }, [timeRange, events]);

  // Load events on mount
  useEffect(() => {
    fetchEvents();
  }, []);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel("email_events_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "email_events",
        },
        (payload) => {
          setEvents((prev) => [payload.new as EmailEvent, ...prev.slice(0, 49)]);
          toast({
            title: "New Email Event",
            description: `${payload.new.event_type}: ${payload.new.recipient}`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSetupWebhooks = async () => {
    setIsSettingUp(true);
    try {
      const { data, error } = await supabase.functions.invoke("setup-mailgun-webhooks");

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Webhooks Configured",
          description: `Successfully configured ${data.configured.length} webhooks in ${data.region} region`,
        });
        setIsConfigured(true);
        fetchEvents();
      } else {
        throw new Error(data.error || "Failed to configure webhooks");
      }
    } catch (error: any) {
      toast({
        title: "Setup Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSettingUp(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Configuration Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Webhook Status</CardTitle>
              <CardDescription>Mailgun webhook configuration and monitoring</CardDescription>
            </div>
            <Badge variant={isConfigured ? "default" : "secondary"}>
              {isConfigured ? "🟢 Configured" : "🔴 Not Configured"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button onClick={handleSetupWebhooks} disabled={isSettingUp}>
              {isSettingUp ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting up...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Setup Webhooks
                </>
              )}
            </Button>
            <Button variant="outline" onClick={fetchEvents}>
              Refresh Events
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Statistics Dashboard */}
      {events.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Email Statistics</CardTitle>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="p-4 rounded-lg bg-muted">
                <div className="text-sm text-muted-foreground">Delivery Rate</div>
                <div className="text-2xl font-bold">{stats.delivery_rate.toFixed(1)}%</div>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <div className="text-sm text-muted-foreground">Open Rate</div>
                <div className="text-2xl font-bold">{stats.open_rate.toFixed(1)}%</div>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <div className="text-sm text-muted-foreground">Click Rate</div>
                <div className="text-2xl font-bold">{stats.click_rate.toFixed(1)}%</div>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <div className="text-sm text-muted-foreground">Bounce Rate</div>
                <div className="text-2xl font-bold">{stats.bounce_rate.toFixed(1)}%</div>
              </div>
              <div className="p-4 rounded-lg bg-muted">
                <div className="text-sm text-muted-foreground">Complaint Rate</div>
                <div className="text-2xl font-bold">{stats.complaint_rate.toFixed(1)}%</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Event Feed */}
      <Card>
        <CardHeader>
          <CardTitle>Live Event Feed</CardTitle>
          <CardDescription>Real-time email events from Mailgun</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Search by recipient or message ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="opened">Opened</SelectItem>
                  <SelectItem value="clicked">Clicked</SelectItem>
                  <SelectItem value="permanent_fail">Permanent Fail</SelectItem>
                  <SelectItem value="temporary_fail">Temporary Fail</SelectItem>
                  <SelectItem value="complained">Complained</SelectItem>
                  <SelectItem value="unsubscribed">Unsubscribed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {filteredEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {events.length === 0
                  ? "No events yet. Configure webhooks and send test emails to see events here."
                  : "No events match your filters."}
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredEvents.map((event) => {
                  const Icon = EVENT_TYPE_ICONS[event.event_type] || Mail;
                  return (
                    <div
                      key={event.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                    >
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{event.event_type}</Badge>
                          <span className="text-sm truncate">{event.recipient}</span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {event.message_id}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(event.timestamp).toLocaleString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
