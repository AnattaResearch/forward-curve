import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  Legend,
  ComposedChart,
  Bar,
} from "recharts";
import { Download, RefreshCw, TrendingUp, Calendar, DollarSign, Activity, Database, Clock, Warehouse } from "lucide-react";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

export default function Home() {
  const [numMonths, setNumMonths] = useState(18);
  const [inputValue, setInputValue] = useState("18");

  // Fetch forward curve data
  const {
    data: forwardCurveResponse,
    isLoading: isLoadingCurve,
    refetch: refetchCurve,
    error: curveError,
  } = trpc.futures.forwardCurve.useQuery(
    { numMonths },
    { 
      staleTime: 60000, // 1 minute
      refetchOnWindowFocus: false,
    }
  );

  // Fetch historical data
  const {
    data: historicalResponse,
    isLoading: isLoadingHistorical,
    refetch: refetchHistorical,
    error: historicalError,
  } = trpc.futures.historical.useQuery(
    { days: 365 },
    { 
      staleTime: 300000, // 5 minutes
      refetchOnWindowFocus: false,
    }
  );

  // Extract data from responses
  const forwardCurve = forwardCurveResponse?.data;
  const historicalData = historicalResponse?.data;
  const isCurveFromCache = forwardCurveResponse?.cached ?? false;
  const curveAge = forwardCurveResponse?.cacheAge;
  const isHistoricalFromCache = historicalResponse?.cached ?? false;
  const historicalAge = historicalResponse?.cacheAge;

  const handleFetch = () => {
    const months = parseInt(inputValue);
    if (months >= 1 && months <= 60) {
      setNumMonths(months);
    }
  };

  const handleRefresh = () => {
    refetchCurve();
    refetchHistorical();
  };

  // Download CSV function
  const downloadCSV = () => {
    if (!forwardCurve || forwardCurve.length === 0) return;

    const headers = ["Contract", "Symbol", "CME Code", "Expiry Date", "Price", "Open", "High", "Low", "Volume", "Last Update"];
    const rows = forwardCurve.map((item) => [
      item.contract,
      item.symbol,
      item.cmeCode,
      item.expiryDate ?? "",
      item.price,
      item.open ?? "",
      item.high ?? "",
      item.low ?? "",
      item.volume ?? "",
      item.lastUpdate ?? "",
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `ng_forward_curve_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  // Calculate statistics
  const stats = forwardCurve
    ? {
        currentPrice: forwardCurve[0]?.price ?? 0,
        maxPrice: Math.max(...forwardCurve.map((d) => d.price)),
        minPrice: Math.min(...forwardCurve.map((d) => d.price)),
        avgPrice: forwardCurve.reduce((sum, d) => sum + d.price, 0) / forwardCurve.length,
      }
    : null;

  // Prepare chart data with volume
  const chartData = forwardCurve?.map((item) => ({
    name: item.contract,
    price: item.price,
    volume: item.volume ?? 0,
  }));

  // Calculate max volume for scaling
  const maxVolume = chartData ? Math.max(...chartData.map(d => d.volume)) : 0;

  const historicalChartData = historicalData?.map((item) => ({
    date: item.date,
    close: item.close,
    high: item.high,
    low: item.low,
    volume: item.volume,
  }));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground">Natural Gas Forward Curve</h1>
                <p className="text-sm text-muted-foreground">Henry Hub Futures (NYMEX)</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Cache Status Badge */}
              {isCurveFromCache && curveAge !== undefined && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  <span>Cached</span>
                  <Clock className="h-3 w-3 ml-1" />
                  <span>{curveAge}s ago</span>
                </Badge>
              )}
              <Link href="/storage">
                <Button variant="outline" size="sm">
                  <Warehouse className="h-4 w-4 mr-2" />
                  Storage Optimization
                </Button>
              </Link>
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoadingCurve || isLoadingHistorical}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingCurve || isLoadingHistorical ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* Controls */}
        <Card className="mb-6">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Forward Curve Settings
            </CardTitle>
            <CardDescription>
              Specify the number of months to display in the forward curve
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex-1 min-w-[200px] max-w-[300px]">
                <Label htmlFor="months" className="text-sm font-medium">
                  Number of Months (1-60)
                </Label>
                <Input
                  id="months"
                  type="number"
                  min={1}
                  max={60}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleFetch()}
                  className="mt-1.5"
                />
              </div>
              <Button onClick={handleFetch} disabled={isLoadingCurve}>
                {isLoadingCurve ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Fetch Data"
                )}
              </Button>
              <Button variant="outline" onClick={downloadCSV} disabled={!forwardCurve || forwardCurve.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <DollarSign className="h-4 w-4" />
                  Front Month
                </div>
                <div className="text-2xl font-bold text-foreground">${stats.currentPrice.toFixed(3)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <TrendingUp className="h-4 w-4" />
                  Curve High
                </div>
                <div className="text-2xl font-bold text-green-600">${stats.maxPrice.toFixed(3)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Activity className="h-4 w-4" />
                  Curve Low
                </div>
                <div className="text-2xl font-bold text-red-600">${stats.minPrice.toFixed(3)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
                  <Activity className="h-4 w-4" />
                  Average
                </div>
                <div className="text-2xl font-bold text-foreground">${stats.avgPrice.toFixed(3)}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Error Display */}
        {(curveError || historicalError) && (
          <Card className="mb-6 border-destructive/50 bg-destructive/5">
            <CardContent className="pt-4">
              <p className="text-destructive text-sm">
                {curveError?.message || historicalError?.message || "An error occurred while fetching data"}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Tabs defaultValue="curve" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="curve">Forward Curve</TabsTrigger>
            <TabsTrigger value="historical">Historical</TabsTrigger>
            <TabsTrigger value="table">Data Table</TabsTrigger>
          </TabsList>

          {/* Forward Curve Chart with Volume */}
          <TabsContent value="curve">
            <Card>
              <CardHeader>
                <CardTitle>Forward Curve</CardTitle>
                <CardDescription>
                  Natural Gas futures prices and volume by contract month ($/MMBtu)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingCurve ? (
                  <div className="h-[400px] flex items-center justify-center">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : chartData && chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={chartData} margin={{ top: 10, right: 60, left: 0, bottom: 60 }}>
                      <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="oklch(0.55 0.15 195)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="oklch(0.55 0.15 195)" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="oklch(0.65 0.12 280)" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="oklch(0.65 0.12 280)" stopOpacity={0.3} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.7 0.01 240)" />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={80}
                        tick={{ fontSize: 11, fill: "oklch(0.5 0.02 240)" }}
                      />
                      <YAxis
                        yAxisId="price"
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 11, fill: "oklch(0.5 0.02 240)" }}
                        tickFormatter={(value) => `$${value.toFixed(2)}`}
                        label={{ 
                          value: 'Price ($/MMBtu)', 
                          angle: -90, 
                          position: 'insideLeft',
                          style: { textAnchor: 'middle', fill: 'oklch(0.5 0.02 240)', fontSize: 11 }
                        }}
                      />
                      <YAxis
                        yAxisId="volume"
                        orientation="right"
                        domain={[0, maxVolume * 1.2]}
                        tick={{ fontSize: 10, fill: "oklch(0.6 0.1 280)" }}
                        tickFormatter={(value) => {
                          if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                          if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
                          return value.toString();
                        }}
                        label={{ 
                          value: 'Volume', 
                          angle: 90, 
                          position: 'insideRight',
                          style: { textAnchor: 'middle', fill: 'oklch(0.6 0.1 280)', fontSize: 11 }
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "oklch(0.98 0 0)",
                          border: "1px solid oklch(0.88 0.01 240)",
                          borderRadius: "8px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        }}
                        formatter={(value: number, name: string) => {
                          if (name === "volume") {
                            return [value.toLocaleString(), "Volume"];
                          }
                          return [`$${value.toFixed(3)}`, "Price"];
                        }}
                      />
                      <Legend 
                        verticalAlign="top" 
                        height={36}
                        formatter={(value) => {
                          if (value === "price") return "Price ($/MMBtu)";
                          if (value === "volume") return "Volume (contracts)";
                          return value;
                        }}
                      />
                      <Bar 
                        yAxisId="volume" 
                        dataKey="volume" 
                        fill="url(#colorVolume)"
                        radius={[2, 2, 0, 0]}
                        maxBarSize={30}
                      />
                      <Area
                        yAxisId="price"
                        type="monotone"
                        dataKey="price"
                        stroke="oklch(0.45 0.15 195)"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorPrice)"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Historical Chart */}
          <TabsContent value="historical">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Historical Prices</CardTitle>
                    <CardDescription>
                      1-year price history for the continuous contract (NG=F)
                    </CardDescription>
                  </div>
                  {isHistoricalFromCache && historicalAge !== undefined && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Database className="h-3 w-3" />
                      <span>Cached {historicalAge}s ago</span>
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingHistorical ? (
                  <div className="h-[400px] flex items-center justify-center">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : historicalChartData && historicalChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <ComposedChart data={historicalChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="oklch(0.55 0.15 195)" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="oklch(0.55 0.15 195)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.7 0.01 240)" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 10, fill: "oklch(0.5 0.02 240)" }}
                        tickFormatter={(value) => {
                          const date = new Date(value);
                          return `${date.getMonth() + 1}/${date.getFullYear().toString().slice(2)}`;
                        }}
                      />
                      <YAxis
                        yAxisId="price"
                        domain={["auto", "auto"]}
                        tick={{ fontSize: 11, fill: "oklch(0.5 0.02 240)" }}
                        tickFormatter={(value) => `$${value.toFixed(1)}`}
                      />
                      <YAxis
                        yAxisId="volume"
                        orientation="right"
                        tick={{ fontSize: 10, fill: "oklch(0.5 0.02 240)" }}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "oklch(0.98 0 0)",
                          border: "1px solid oklch(0.88 0.01 240)",
                          borderRadius: "8px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                        }}
                        formatter={(value: number, name: string) => {
                          if (name === "volume") return [value.toLocaleString(), "Volume"];
                          return [`$${value.toFixed(3)}`, name.charAt(0).toUpperCase() + name.slice(1)];
                        }}
                      />
                      <Legend />
                      <Bar yAxisId="volume" dataKey="volume" fill="oklch(0.7 0.05 240)" opacity={0.3} />
                      <Area
                        yAxisId="price"
                        type="monotone"
                        dataKey="close"
                        stroke="oklch(0.45 0.15 195)"
                        strokeWidth={1.5}
                        fillOpacity={1}
                        fill="url(#colorClose)"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    No historical data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Data Table */}
          <TabsContent value="table">
            <Card>
              <CardHeader>
                <CardTitle>Contract Details</CardTitle>
                <CardDescription>
                  Detailed information for each futures contract
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingCurve ? (
                  <div className="h-[400px] flex items-center justify-center">
                    <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : forwardCurve && forwardCurve.length > 0 ? (
                  <div className="rounded-md border overflow-auto max-h-[500px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-card">
                        <TableRow>
                          <TableHead className="font-semibold">Contract</TableHead>
                          <TableHead className="font-semibold">Symbol</TableHead>
                          <TableHead className="font-semibold">Expiry Date</TableHead>
                          <TableHead className="font-semibold text-right">Price</TableHead>
                          <TableHead className="font-semibold text-right">Open</TableHead>
                          <TableHead className="font-semibold text-right">High</TableHead>
                          <TableHead className="font-semibold text-right">Low</TableHead>
                          <TableHead className="font-semibold text-right">Volume</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {forwardCurve.map((item, index) => (
                          <TableRow key={item.symbol} className={index % 2 === 0 ? "bg-muted/30" : ""}>
                            <TableCell className="font-medium">{item.contract}</TableCell>
                            <TableCell className="text-muted-foreground font-mono text-sm">
                              {item.symbol}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {item.expiryDate ?? "-"}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              ${item.price.toFixed(3)}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.open ? `$${item.open.toFixed(3)}` : "-"}
                            </TableCell>
                            <TableCell className="text-right text-green-600">
                              {item.high ? `$${item.high.toFixed(3)}` : "-"}
                            </TableCell>
                            <TableCell className="text-right text-red-600">
                              {item.low ? `$${item.low.toFixed(3)}` : "-"}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.volume?.toLocaleString() ?? "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Footer */}
        <footer className="mt-8 pt-6 border-t text-center text-sm text-muted-foreground">
          <p>
            Data provided by Yahoo Finance. Prices are delayed by approximately 15-20 minutes.
          </p>
          <p className="mt-1">
            Natural Gas futures are traded on NYMEX (New York Mercantile Exchange).
          </p>
          <p className="mt-1">
            Server-side caching enabled (5-minute TTL) for improved performance.
          </p>
        </footer>
      </main>
    </div>
  );
}
