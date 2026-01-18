import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Package, RefreshCw, ArrowLeft, Download, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// Natural gas futures minimum price fluctuation is $0.001 per MMBtu
// So we use 3 decimal places for all price-related values
const PRICE_DECIMALS = 3;

// Facility parameters matching gas_storage package
interface FacilityParams {
  capacity: number;
  max_inject_rate: number;
  max_withdraw_rate: number;
  inject_cost: number;
  withdraw_cost: number;
  initial_inventory: number;
}

// Optimization parameters matching gas_storage package
interface OptimizationParams {
  risk_free_rate: number;
  trading_days_per_year: number;
  asof_date?: string;
}

const DEFAULT_FACILITY_PARAMS: FacilityParams = {
  capacity: 100.0,
  max_inject_rate: 10.0,
  max_withdraw_rate: 15.0,
  inject_cost: 0.0,
  withdraw_cost: 0.0,
  initial_inventory: 0.0,
};

const DEFAULT_OPTIMIZATION_PARAMS: OptimizationParams = {
  risk_free_rate: 0.05,
  trading_days_per_year: 252,
};

// Helper function to format price values with correct decimal places
const formatPrice = (value: number): string => value.toFixed(PRICE_DECIMALS);

// Helper function to format volume values (integer for simplicity)
const formatVolume = (value: number): string => value.toFixed(0);

export default function StorageOptimization() {
  const [numMonths, setNumMonths] = useState(12);
  const [facilityParams, setFacilityParams] = useState<FacilityParams>(DEFAULT_FACILITY_PARAMS);
  const [optimizationParams, setOptimizationParams] = useState<OptimizationParams>(DEFAULT_OPTIMIZATION_PARAMS);
  const [activeTab, setActiveTab] = useState("trades");

  const { data, isLoading, error, refetch } = trpc.storage.optimize.useQuery(
    { 
      numMonths, 
      facilityParams,
      optimizationParams,
    },
    { refetchOnWindowFocus: false }
  );

  const handleFacilityParamChange = (key: keyof FacilityParams, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setFacilityParams(prev => ({ ...prev, [key]: numValue }));
    }
  };

  const handleOptimizationParamChange = (key: keyof OptimizationParams, value: string) => {
    if (key === "asof_date") {
      setOptimizationParams(prev => ({ ...prev, [key]: value || undefined }));
    } else {
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        setOptimizationParams(prev => ({ ...prev, [key]: numValue }));
      }
    }
  };

  const resetParams = () => {
    setFacilityParams(DEFAULT_FACILITY_PARAMS);
    setOptimizationParams(DEFAULT_OPTIMIZATION_PARAMS);
  };

  // Download trades CSV
  const downloadTradesCSV = () => {
    if (!data?.result.trades || data.result.trades.length === 0) return;

    const headers = ["Inject Date", "Withdraw Date", "Volume", "Spread", "Profit"];
    const rows = data.result.trades.map(t => [
      t.inject_date,
      t.withdraw_date,
      formatVolume(t.volume),
      formatPrice(t.spread),
      formatPrice(t.profit),
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storage_trades_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download positions CSV
  const downloadPositionsCSV = () => {
    if (!data?.result.storage_positions || data.result.storage_positions.length === 0) return;

    const headers = ["Date", "Position"];
    const rows = data.result.storage_positions.map(p => [
      p.date,
      formatVolume(p.position),
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storage_positions_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Calculate summary statistics
  const totalInjection = data?.result.injection_schedule?.reduce((sum, s) => sum + s.volume, 0) || 0;
  const totalWithdrawal = data?.result.withdrawal_schedule?.reduce((sum, s) => sum + s.volume, 0) || 0;
  const peakInventory = data?.result.storage_positions?.reduce((max, p) => Math.max(max, p.position), 0) || 0;

  // Prepare chart data for positions
  const positionChartData = data?.result.storage_positions?.map(p => ({
    date: p.date.slice(5), // MM-DD format
    fullDate: p.date,
    position: p.position,
  })) || [];

  // Prepare chart data for injection/withdrawal by date
  const scheduleChartData = (() => {
    if (!data?.result.storage_positions) return [];
    
    const injectionMap = new Map(data.result.injection_schedule?.map(s => [s.date, s.volume]) || []);
    const withdrawalMap = new Map(data.result.withdrawal_schedule?.map(s => [s.date, s.volume]) || []);
    
    return data.result.storage_positions.map(p => ({
      date: p.date.slice(5),
      fullDate: p.date,
      injection: injectionMap.get(p.date) || 0,
      withdrawal: -(withdrawalMap.get(p.date) || 0),
      position: p.position,
    }));
  })();

  // Get forward curve price map for display
  const priceMap = new Map(data?.forwardCurve?.map(fc => [fc.expiryDate, fc.price]) || []);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Forward Curve
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Storage Optimization</h1>
              <p className="text-sm text-muted-foreground">
                Static Intrinsic Valuation using gas_storage package
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* Parameters Panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Facility Parameters</CardTitle>
                <CardDescription>Configure storage facility constraints</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="numMonths">Forward Curve Months</Label>
                  <Input
                    id="numMonths"
                    type="number"
                    min={2}
                    max={60}
                    value={numMonths}
                    onChange={e => setNumMonths(parseInt(e.target.value) || 12)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input
                    id="capacity"
                    type="number"
                    step="0.1"
                    value={facilityParams.capacity}
                    onChange={e => handleFacilityParamChange("capacity", e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="max_inject_rate">Max Inject Rate (per period)</Label>
                    <Input
                      id="max_inject_rate"
                      type="number"
                      step="0.1"
                      value={facilityParams.max_inject_rate}
                      onChange={e => handleFacilityParamChange("max_inject_rate", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max_withdraw_rate">Max Withdraw Rate (per period)</Label>
                    <Input
                      id="max_withdraw_rate"
                      type="number"
                      step="0.1"
                      value={facilityParams.max_withdraw_rate}
                      onChange={e => handleFacilityParamChange("max_withdraw_rate", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="inject_cost">Inject Cost ($/MMBtu)</Label>
                    <Input
                      id="inject_cost"
                      type="number"
                      step="0.001"
                      value={facilityParams.inject_cost}
                      onChange={e => handleFacilityParamChange("inject_cost", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="withdraw_cost">Withdraw Cost ($/MMBtu)</Label>
                    <Input
                      id="withdraw_cost"
                      type="number"
                      step="0.001"
                      value={facilityParams.withdraw_cost}
                      onChange={e => handleFacilityParamChange("withdraw_cost", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="initial_inventory">Initial Inventory</Label>
                  <Input
                    id="initial_inventory"
                    type="number"
                    step="0.1"
                    value={facilityParams.initial_inventory}
                    onChange={e => handleFacilityParamChange("initial_inventory", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Optimization Parameters</CardTitle>
                <CardDescription>Configure valuation settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="risk_free_rate">Risk-Free Rate</Label>
                    <Input
                      id="risk_free_rate"
                      type="number"
                      step="0.01"
                      value={optimizationParams.risk_free_rate}
                      onChange={e => handleOptimizationParamChange("risk_free_rate", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trading_days_per_year">Trading Days/Year</Label>
                    <Input
                      id="trading_days_per_year"
                      type="number"
                      value={optimizationParams.trading_days_per_year}
                      onChange={e => handleOptimizationParamChange("trading_days_per_year", e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="asof_date">As-of Date (optional)</Label>
                  <Input
                    id="asof_date"
                    type="date"
                    value={optimizationParams.asof_date || ""}
                    onChange={e => handleOptimizationParamChange("asof_date", e.target.value)}
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <Button onClick={() => refetch()} disabled={isLoading} className="flex-1">
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    Calculate
                  </Button>
                  <Button variant="outline" onClick={resetParams}>
                    Reset
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Results Summary */}
            {data && data.result.success && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Optimization Results</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Total PnL
                    </span>
                    <span className="font-bold text-green-600">
                      ${formatPrice(data.result.total_pnl)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <ArrowRight className="h-4 w-4" />
                      Number of Trades
                    </span>
                    <span className="font-medium">
                      {data.result.num_trades}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Total Injection
                    </span>
                    <span className="font-medium">
                      {formatVolume(totalInjection)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <TrendingDown className="h-4 w-4" />
                      Total Withdrawal
                    </span>
                    <span className="font-medium">
                      {formatVolume(totalWithdrawal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Peak Inventory
                    </span>
                    <span className="font-medium">
                      {formatVolume(peakInventory)}
                    </span>
                  </div>
                  <div className="pt-2 text-xs text-muted-foreground">
                    Capacity Utilization: {((peakInventory / facilityParams.capacity) * 100).toFixed(1)}%
                  </div>
                </CardContent>
              </Card>
            )}

            {data && !data.result.success && (
              <Card className="border-destructive">
                <CardHeader>
                  <CardTitle className="text-lg text-destructive">Optimization Failed</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-destructive">{data.result.error}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Main Content */}
          <div className="space-y-4">
            {error && (
              <Card className="border-destructive">
                <CardContent className="pt-6">
                  <p className="text-destructive">Error: {error.message}</p>
                </CardContent>
              </Card>
            )}

            {isLoading && (
              <Card>
                <CardContent className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="ml-3 text-muted-foreground">Running gas_storage optimization...</span>
                </CardContent>
              </Card>
            )}

            {data && data.result.success && !isLoading && (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="flex items-center justify-between">
                  <TabsList>
                    <TabsTrigger value="trades">Trade Pairs</TabsTrigger>
                    <TabsTrigger value="positions">Storage Positions</TabsTrigger>
                    <TabsTrigger value="schedule">Schedule Chart</TabsTrigger>
                  </TabsList>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={downloadTradesCSV} disabled={!data.result.trades?.length}>
                      <Download className="h-4 w-4 mr-2" />
                      Trades CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={downloadPositionsCSV} disabled={!data.result.storage_positions?.length}>
                      <Download className="h-4 w-4 mr-2" />
                      Positions CSV
                    </Button>
                  </div>
                </div>

                <TabsContent value="trades" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Optimal Trade Pairs</CardTitle>
                      <CardDescription>
                        Each row represents an inject-withdraw pair with volume and profit (prices in $/MMBtu)
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {data.result.trades && data.result.trades.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-border">
                                <th className="text-left py-3 px-4 font-medium">Inject Date</th>
                                <th className="text-right py-3 px-4 font-medium">Inject Price</th>
                                <th className="text-center py-3 px-4 font-medium"></th>
                                <th className="text-left py-3 px-4 font-medium">Withdraw Date</th>
                                <th className="text-right py-3 px-4 font-medium">Withdraw Price</th>
                                <th className="text-right py-3 px-4 font-medium">Volume</th>
                                <th className="text-right py-3 px-4 font-medium">Spread</th>
                                <th className="text-right py-3 px-4 font-medium">Profit</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.result.trades.map((trade, idx) => (
                                <tr key={idx} className="border-b border-border/50 hover:bg-muted/50">
                                  <td className="py-3 px-4 text-blue-500">{trade.inject_date}</td>
                                  <td className="text-right py-3 px-4">
                                    ${formatPrice(priceMap.get(trade.inject_date) || 0)}
                                  </td>
                                  <td className="text-center py-3 px-4">
                                    <ArrowRight className="h-4 w-4 text-muted-foreground inline" />
                                  </td>
                                  <td className="py-3 px-4 text-red-500">{trade.withdraw_date}</td>
                                  <td className="text-right py-3 px-4">
                                    ${formatPrice(priceMap.get(trade.withdraw_date) || 0)}
                                  </td>
                                  <td className="text-right py-3 px-4 font-medium">{formatVolume(trade.volume)}</td>
                                  <td className="text-right py-3 px-4">${formatPrice(trade.spread)}</td>
                                  <td className={`text-right py-3 px-4 font-medium ${trade.profit >= 0 ? "text-green-500" : "text-red-500"}`}>
                                    ${formatPrice(trade.profit)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-border font-bold">
                                <td colSpan={5} className="py-3 px-4">Total</td>
                                <td className="text-right py-3 px-4">
                                  {formatVolume(data.result.trades.reduce((sum, t) => sum + t.volume, 0))}
                                </td>
                                <td className="text-right py-3 px-4">-</td>
                                <td className="text-right py-3 px-4 text-green-500">
                                  ${formatPrice(data.result.total_pnl)}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <p className="text-muted-foreground text-center py-8">
                          No profitable trades found with current parameters.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="positions" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Storage Positions Over Time</CardTitle>
                      <CardDescription>
                        Projected inventory level at each contract expiry date
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={positionChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                            <XAxis
                              dataKey="date"
                              tick={{ fill: "#9CA3AF", fontSize: 11 }}
                              angle={-45}
                              textAnchor="end"
                              height={60}
                            />
                            <YAxis
                              tick={{ fill: "#9CA3AF", fontSize: 11 }}
                              label={{ value: "Position", angle: -90, position: "insideLeft", fill: "#9CA3AF" }}
                              domain={[0, facilityParams.capacity * 1.1]}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#1F2937",
                                border: "1px solid #374151",
                                borderRadius: "8px",
                              }}
                              formatter={(value: number) => [formatVolume(value), "Position"]}
                              labelFormatter={label => positionChartData.find(d => d.date === label)?.fullDate || label}
                            />
                            <Legend />
                            <ReferenceLine
                              y={facilityParams.capacity}
                              stroke="#F59E0B"
                              strokeDasharray="5 5"
                              label={{ value: "Capacity", fill: "#F59E0B", position: "right" }}
                            />
                            <Line
                              type="monotone"
                              dataKey="position"
                              stroke="#8B5CF6"
                              strokeWidth={3}
                              dot={{ fill: "#8B5CF6", r: 4 }}
                              name="Storage Position"
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                      
                      {/* Position Table */}
                      <div className="mt-6 overflow-x-auto max-h-[300px]">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0 bg-background">
                            <tr className="border-b border-border">
                              <th className="text-left py-3 px-4 font-medium">Date</th>
                              <th className="text-right py-3 px-4 font-medium">Position</th>
                              <th className="text-right py-3 px-4 font-medium">% Capacity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.result.storage_positions?.map((pos, idx) => (
                              <tr key={idx} className="border-b border-border/50 hover:bg-muted/50">
                                <td className="py-2 px-4">{pos.date}</td>
                                <td className="text-right py-2 px-4 font-medium">{formatVolume(pos.position)}</td>
                                <td className="text-right py-2 px-4 text-muted-foreground">
                                  {((pos.position / facilityParams.capacity) * 100).toFixed(1)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="schedule" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Injection/Withdrawal Schedule</CardTitle>
                      <CardDescription>
                        Blue bars show injection volumes, red bars show withdrawal volumes
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={scheduleChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                            <XAxis
                              dataKey="date"
                              tick={{ fill: "#9CA3AF", fontSize: 11 }}
                              angle={-45}
                              textAnchor="end"
                              height={60}
                            />
                            <YAxis
                              yAxisId="volume"
                              tick={{ fill: "#9CA3AF", fontSize: 11 }}
                              label={{ value: "Volume", angle: -90, position: "insideLeft", fill: "#9CA3AF" }}
                            />
                            <YAxis
                              yAxisId="position"
                              orientation="right"
                              tick={{ fill: "#9CA3AF", fontSize: 11 }}
                              label={{ value: "Position", angle: 90, position: "insideRight", fill: "#9CA3AF" }}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#1F2937",
                                border: "1px solid #374151",
                                borderRadius: "8px",
                              }}
                              formatter={(value: number, name: string) => {
                                if (name === "injection") return [formatVolume(value), "Injection"];
                                if (name === "withdrawal") return [formatVolume(Math.abs(value)), "Withdrawal"];
                                if (name === "position") return [formatVolume(value), "Position"];
                                return [value, name];
                              }}
                              labelFormatter={label => scheduleChartData.find(d => d.date === label)?.fullDate || label}
                            />
                            <Legend />
                            <ReferenceLine yAxisId="volume" y={0} stroke="#6B7280" />
                            <Bar
                              yAxisId="volume"
                              dataKey="injection"
                              fill="#3B82F6"
                              name="Injection"
                              radius={[4, 4, 0, 0]}
                            />
                            <Bar
                              yAxisId="volume"
                              dataKey="withdrawal"
                              fill="#EF4444"
                              name="Withdrawal"
                              radius={[0, 0, 4, 4]}
                            />
                            <Line
                              yAxisId="position"
                              type="monotone"
                              dataKey="position"
                              stroke="#8B5CF6"
                              strokeWidth={2}
                              dot={{ fill: "#8B5CF6", r: 3 }}
                              name="Position"
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
