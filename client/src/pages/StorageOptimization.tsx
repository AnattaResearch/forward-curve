import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, TrendingUp, TrendingDown, DollarSign, Package, RefreshCw, ArrowLeft, Download } from "lucide-react";
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

interface FacilityParams {
  capacity: number;
  maxInjectionRate: number;
  maxWithdrawalRate: number;
  injectionCost: number;
  withdrawalCost: number;
  initialInventory: number;
  discountRate: number;
}

const DEFAULT_PARAMS: FacilityParams = {
  capacity: 1000000,
  maxInjectionRate: 10000,
  maxWithdrawalRate: 20000,
  injectionCost: 0.02,
  withdrawalCost: 0.01,
  initialInventory: 0,
  discountRate: 0.05,
};

export default function StorageOptimization() {
  const [numMonths, setNumMonths] = useState(12);
  const [params, setParams] = useState<FacilityParams>(DEFAULT_PARAMS);
  const [activeTab, setActiveTab] = useState("schedule");

  const { data, isLoading, error, refetch } = trpc.storage.optimize.useQuery(
    { numMonths, facilityParams: params },
    { refetchOnWindowFocus: false }
  );

  const handleParamChange = (key: keyof FacilityParams, value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setParams(prev => ({ ...prev, [key]: numValue }));
    }
  };

  const resetParams = () => {
    setParams(DEFAULT_PARAMS);
  };

  const downloadCSV = () => {
    if (!data?.result.schedule) return;

    const headers = ["Month", "Price ($/MMBtu)", "Injection (MMBtu)", "Withdrawal (MMBtu)", "Net Flow (MMBtu)", "Ending Inventory (MMBtu)"];
    const rows = data.result.schedule.map(s => [
      s.month,
      s.price.toFixed(3),
      s.injection.toString(),
      s.withdrawal.toString(),
      s.netFlow.toString(),
      s.endingInventory.toString(),
    ]);

    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storage_optimization_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Prepare chart data
  const chartData = data?.result.schedule.map(s => ({
    month: s.month.replace(/\s+\d{4}$/, ""), // Shorten month label
    fullMonth: s.month,
    injection: s.injection,
    withdrawal: -s.withdrawal, // Negative for visualization
    inventory: s.endingInventory,
    price: s.price,
  })) || [];

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
                Static Intrinsic Valuation for Natural Gas Storage
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6">
        <div className="grid gap-6 lg:grid-cols-[350px_1fr]">
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
                  <Label htmlFor="capacity">Capacity (MMBtu)</Label>
                  <Input
                    id="capacity"
                    type="number"
                    value={params.capacity}
                    onChange={e => handleParamChange("capacity", e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="maxInjectionRate">Max Injection (MMBtu/day)</Label>
                    <Input
                      id="maxInjectionRate"
                      type="number"
                      value={params.maxInjectionRate}
                      onChange={e => handleParamChange("maxInjectionRate", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxWithdrawalRate">Max Withdrawal (MMBtu/day)</Label>
                    <Input
                      id="maxWithdrawalRate"
                      type="number"
                      value={params.maxWithdrawalRate}
                      onChange={e => handleParamChange("maxWithdrawalRate", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="injectionCost">Injection Cost ($/MMBtu)</Label>
                    <Input
                      id="injectionCost"
                      type="number"
                      step="0.001"
                      value={params.injectionCost}
                      onChange={e => handleParamChange("injectionCost", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="withdrawalCost">Withdrawal Cost ($/MMBtu)</Label>
                    <Input
                      id="withdrawalCost"
                      type="number"
                      step="0.001"
                      value={params.withdrawalCost}
                      onChange={e => handleParamChange("withdrawalCost", e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="initialInventory">Initial Inventory (MMBtu)</Label>
                    <Input
                      id="initialInventory"
                      type="number"
                      value={params.initialInventory}
                      onChange={e => handleParamChange("initialInventory", e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discountRate">Discount Rate (%)</Label>
                    <Input
                      id="discountRate"
                      type="number"
                      step="0.01"
                      value={(params.discountRate * 100).toFixed(1)}
                      onChange={e => handleParamChange("discountRate", (parseFloat(e.target.value) / 100).toString())}
                    />
                  </div>
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
            {data && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Optimization Results</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Intrinsic Value
                    </span>
                    <span className="font-bold text-green-600">
                      ${data.result.totalValue.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Total Injection
                    </span>
                    <span className="font-medium">
                      {data.result.totalInjection.toLocaleString()} MMBtu
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <TrendingDown className="h-4 w-4" />
                      Total Withdrawal
                    </span>
                    <span className="font-medium">
                      {data.result.totalWithdrawal.toLocaleString()} MMBtu
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Peak Inventory
                    </span>
                    <span className="font-medium">
                      {data.result.peakInventory.toLocaleString()} MMBtu
                    </span>
                  </div>
                  <div className="pt-2 text-xs text-muted-foreground">
                    Capacity Utilization: {((data.result.peakInventory / params.capacity) * 100).toFixed(1)}%
                  </div>
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
                  <span className="ml-3 text-muted-foreground">Calculating optimal schedule...</span>
                </CardContent>
              </Card>
            )}

            {data && !isLoading && (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <div className="flex items-center justify-between">
                  <TabsList>
                    <TabsTrigger value="schedule">Schedule Chart</TabsTrigger>
                    <TabsTrigger value="inventory">Inventory Position</TabsTrigger>
                    <TabsTrigger value="table">Data Table</TabsTrigger>
                  </TabsList>
                  <Button variant="outline" size="sm" onClick={downloadCSV}>
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV
                  </Button>
                </div>

                <TabsContent value="schedule" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Optimal Injection/Withdrawal Schedule</CardTitle>
                      <CardDescription>
                        Blue bars show injection volumes, red bars show withdrawal volumes
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                            <XAxis
                              dataKey="month"
                              tick={{ fill: "#9CA3AF", fontSize: 11 }}
                              angle={-45}
                              textAnchor="end"
                              height={60}
                            />
                            <YAxis
                              yAxisId="volume"
                              tick={{ fill: "#9CA3AF", fontSize: 11 }}
                              tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                              label={{ value: "Volume (MMBtu)", angle: -90, position: "insideLeft", fill: "#9CA3AF" }}
                            />
                            <YAxis
                              yAxisId="price"
                              orientation="right"
                              tick={{ fill: "#9CA3AF", fontSize: 11 }}
                              tickFormatter={v => `$${v.toFixed(2)}`}
                              label={{ value: "Price ($/MMBtu)", angle: 90, position: "insideRight", fill: "#9CA3AF" }}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#1F2937",
                                border: "1px solid #374151",
                                borderRadius: "8px",
                              }}
                              formatter={(value: number, name: string) => {
                                if (name === "price") return [`$${value.toFixed(3)}`, "Price"];
                                if (name === "injection") return [`${value.toLocaleString()} MMBtu`, "Injection"];
                                if (name === "withdrawal") return [`${Math.abs(value).toLocaleString()} MMBtu`, "Withdrawal"];
                                return [value, name];
                              }}
                              labelFormatter={label => chartData.find(d => d.month === label)?.fullMonth || label}
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
                              yAxisId="price"
                              type="monotone"
                              dataKey="price"
                              stroke="#10B981"
                              strokeWidth={2}
                              dot={{ fill: "#10B981", r: 3 }}
                              name="Price"
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="inventory" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Storage Inventory Position Over Time</CardTitle>
                      <CardDescription>
                        Ending inventory level at each month based on optimal schedule
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                            <XAxis
                              dataKey="month"
                              tick={{ fill: "#9CA3AF", fontSize: 11 }}
                              angle={-45}
                              textAnchor="end"
                              height={60}
                            />
                            <YAxis
                              tick={{ fill: "#9CA3AF", fontSize: 11 }}
                              tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                              label={{ value: "Inventory (MMBtu)", angle: -90, position: "insideLeft", fill: "#9CA3AF" }}
                              domain={[0, params.capacity * 1.1]}
                            />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: "#1F2937",
                                border: "1px solid #374151",
                                borderRadius: "8px",
                              }}
                              formatter={(value: number) => [`${value.toLocaleString()} MMBtu`, "Inventory"]}
                              labelFormatter={label => chartData.find(d => d.month === label)?.fullMonth || label}
                            />
                            <Legend />
                            <ReferenceLine
                              y={params.capacity}
                              stroke="#F59E0B"
                              strokeDasharray="5 5"
                              label={{ value: "Capacity", fill: "#F59E0B", position: "right" }}
                            />
                            <Line
                              type="monotone"
                              dataKey="inventory"
                              stroke="#8B5CF6"
                              strokeWidth={3}
                              dot={{ fill: "#8B5CF6", r: 4 }}
                              name="Inventory Level"
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="table" className="mt-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Monthly Schedule Details</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-3 px-4 font-medium">Month</th>
                              <th className="text-right py-3 px-4 font-medium">Price</th>
                              <th className="text-right py-3 px-4 font-medium">Injection</th>
                              <th className="text-right py-3 px-4 font-medium">Withdrawal</th>
                              <th className="text-right py-3 px-4 font-medium">Net Flow</th>
                              <th className="text-right py-3 px-4 font-medium">Ending Inventory</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.result.schedule.map((row, idx) => (
                              <tr key={idx} className="border-b border-border/50 hover:bg-muted/50">
                                <td className="py-3 px-4">{row.month}</td>
                                <td className="text-right py-3 px-4">${row.price.toFixed(3)}</td>
                                <td className="text-right py-3 px-4 text-blue-500">
                                  {row.injection > 0 ? row.injection.toLocaleString() : "-"}
                                </td>
                                <td className="text-right py-3 px-4 text-red-500">
                                  {row.withdrawal > 0 ? row.withdrawal.toLocaleString() : "-"}
                                </td>
                                <td className={`text-right py-3 px-4 ${row.netFlow >= 0 ? "text-green-500" : "text-red-500"}`}>
                                  {row.netFlow >= 0 ? "+" : ""}{row.netFlow.toLocaleString()}
                                </td>
                                <td className="text-right py-3 px-4 font-medium">
                                  {row.endingInventory.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
