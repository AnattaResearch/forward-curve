import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { spawn } from "child_process";
import path from "path";

// Types for futures data
interface ForwardCurveData {
  contract: string;
  symbol: string;
  month: number;
  year: number;
  cmeCode: string;
  price: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  lastUpdate: string | null;
}

interface HistoricalData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Helper function to run Python script using spawn with clean environment
function runPythonScript(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "server", "fetch_ng_data.py");
    
    // Use spawn with minimal clean environment
    const pythonProcess = spawn('/usr/bin/python3.11', [scriptPath, command, ...args], {
      env: {
        PATH: '/usr/bin:/bin:/usr/local/bin',
        HOME: '/home/ubuntu',
        LANG: 'en_US.UTF-8',
      },
      timeout: 120000,
    });
    
    let stdout = '';
    let stderr = '';
    
    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    pythonProcess.on('close', (code) => {
      // Filter out yfinance warnings from stderr
      if (stderr && !stderr.includes("possibly delisted") && !stderr.includes("HTTP Error")) {
        console.error("Python stderr:", stderr);
      }
      
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Python script exited with code ${code}: ${stderr}`));
      }
    });
    
    pythonProcess.on('error', (err) => {
      reject(new Error(`Failed to start Python process: ${err.message}`));
    });
  });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Natural Gas Futures API
  futures: router({
    // Get live forward curve
    forwardCurve: publicProcedure
      .input(z.object({
        numMonths: z.number().min(1).max(60).default(24),
      }))
      .query(async ({ input }): Promise<ForwardCurveData[]> => {
        const output = await runPythonScript("forward_curve", [input.numMonths.toString()]);
        
        try {
          const data = JSON.parse(output);
          if (data.error) {
            throw new Error(data.error);
          }
          return data as ForwardCurveData[];
        } catch (e) {
          console.error("Failed to parse forward curve data:", output);
          throw new Error("Failed to parse forward curve data");
        }
      }),

    // Get historical prices
    historical: publicProcedure
      .input(z.object({
        days: z.number().min(1).max(3650).default(365),
      }))
      .query(async ({ input }): Promise<HistoricalData[]> => {
        const output = await runPythonScript("historical", [input.days.toString()]);
        
        try {
          const data = JSON.parse(output);
          if (data.error) {
            throw new Error(data.error);
          }
          return data as HistoricalData[];
        } catch (e) {
          console.error("Failed to parse historical data:", output);
          throw new Error("Failed to parse historical data");
        }
      }),
  }),
});

export type AppRouter = typeof appRouter;
