import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.futboltotal.manager",
  appName: "Fútbol Total Manager",
  webDir: "dist",
  android: {
    backgroundColor: "#0a0e14",
    allowMixedContent: false,
  },
};

export default config;
