import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  axes: ["opsz", "SOFT"],
  display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  title: "Educational Insights — Income & Math Outcomes",
  description:
    "Exploring the correlation between household income and grade-8 math proficiency across US schools.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>
          <main className="min-h-screen">{children}</main>
          <footer className="border-t border-line">
            <div className="mx-auto grid max-w-7xl gap-6 px-5 py-10 text-sm text-muted sm:px-8 md:grid-cols-3">
              <div>
                <div className="font-serif text-lg text-ink">Educational Insights</div>
                <p className="mt-1">An experimental, directional look at income and grade-8 math outcomes, 2020–21.</p>
              </div>
              <div>
                <div className="kicker mb-1.5">Sources</div>
                <p>Urban Institute EdFacts · US Census ACS · EPA National Walkability Index</p>
              </div>
              <div>
                <div className="kicker mb-1.5">Method</div>
                <p>
                  Income proxy: % households earning $150k+ in school ZIP. Math: grade-8 proficiency midpoint.
                  Pearson r per county/state, minimum 3 schools.
                </p>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
