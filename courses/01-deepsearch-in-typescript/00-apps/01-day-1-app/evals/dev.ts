export const devData = [
  {
    input:
      "What is the name and opening date of Nuremberg's airport? Also include the aviation codes.",
    expected:
      "The name of Nuremberg's airport is Nuremberg Airport (Flughafen Nürnberg) or 'Albrecht Dürer Airport', and it opened on 6th April 1955. It's ICAO code is EDDN and IATA code is NUE.",
  },
  {
    input: "What is the latest version of TypeScript?",
    expected: "The current TypeScript version is 5.8.3",
  },
  {
    input: "What are the main features of Next.js 15?",
    expected: `\n@next/codemod CLI: Easily upgrade to the latest Next.js and React versions.\nAsync Request APIs (Breaking): Incremental step towards a simplified rendering and caching model.\nCaching Semantics (Breaking): fetch requests, GET Route Handlers, and client navigations are no longer cached by default.\nReact 19 Support: Support for React 19, React Compiler (Experimental), and hydration error improvements.\nTurbopack Dev (Stable): Performance and stability improvements.\nStatic Indicator: New visual indicator shows static routes during development.\nunstable_after API (Experimental): Execute code after a response finishes streaming.\ninstrumentation.js API (Stable): New API for server lifecycle observability.\nEnhanced Forms (next/form): Enhance HTML forms with client-side navigation.\nnext.config: TypeScript support for next.config.ts.\nSelf-hosting Improvements: More control over Cache-Control headers.\nServer Actions Security: Unguessable endpoints and removal of unused actions.\nBundling External Packages (Stable): New config options for App and Pages Router.\nESLint 9 Support: Added support for ESLint 9.\nDevelopment and Build Performance: Improved build times and Faster Fast Refresh.\n`,
  },
  {
    input: "What is the outstanding feature of the Nuremberg Subway system?",
    expected:
      "It is the first subway system in the world to be fully automated and driverless.",
  },
  {
    input: "Who cost more to sign, Bakayosaka or Gabriel Martinelli?",
    expected:
      "Gabriel Martinelli was signed, but Bakayosaka actually wasn't because he came from Arsenal's academy.",
  },
];
