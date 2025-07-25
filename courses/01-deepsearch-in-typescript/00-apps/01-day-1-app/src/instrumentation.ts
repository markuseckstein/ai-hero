import { registerOTel } from "@vercel/otel";
import { LangfuseExporter } from "langfuse-vercel";
import { env } from "./env";

export function register() {
  registerOTel({
    serviceName: "ai-hero-deepsearch-course",
    traceExporter: new LangfuseExporter({
      environment: env.NODE_ENV,
    }),
  });
}
