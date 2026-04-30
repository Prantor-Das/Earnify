export const theme = {
  colors: {
    primary: "#F59E0B",
    secondary: "#D97706",
    accent: "#F59E0B",
    danger: "#525252",
    success: "#F59E0B",
    muted: "#A3A3A3",
    background: "#FAFAFA",
    foreground: "#0A0A0A",
    surface: "#F5F5F5",
    surfaceStrong: "#E5E5E5",
    border: "#E5E5E5",
    grayDark: "#525252",
  },
  typography: {
    fonts: {
      sans: '"Inter", "Geist Sans", "Segoe UI", sans-serif',
    },
    fontSizes: {
      xs: "0.75rem",
      sm: "0.875rem",
      md: "1rem",
      lg: "1.125rem",
      xl: "1.5rem",
      "2xl": "2rem",
    },
    fontWeights: {
      regular: 400,
      medium: 500,
      semibold: 500,
      bold: 500,
    },
  },
  spacing: {
    0: "0rem",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
    12: "3rem",
    16: "4rem",
  },
  borderRadius: {
    sm: "0.375rem",
    md: "0.375rem",
    lg: "0.5rem",
    full: "0.5rem",
  },
  breakpoints: {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
  },
} as const;

type FlatTokenMap = Record<string, string | number>;

function flattenTokens(
  prefix: string,
  value: Record<string, unknown>,
  target: FlatTokenMap,
) {
  for (const [key, nestedValue] of Object.entries(value)) {
    const tokenName = prefix ? `${prefix}-${key}` : key;

    if (typeof nestedValue === "string" || typeof nestedValue === "number") {
      target[tokenName] = nestedValue;
      continue;
    }

    flattenTokens(tokenName, nestedValue as Record<string, unknown>, target);
  }
}

export function getThemeCssVariables() {
  const tokens: FlatTokenMap = {};

  flattenTokens("token-color", theme.colors, tokens);
  flattenTokens("token-font", theme.typography.fonts, tokens);
  flattenTokens("token-font-size", theme.typography.fontSizes, tokens);
  flattenTokens("token-font-weight", theme.typography.fontWeights, tokens);
  flattenTokens("token-space", theme.spacing, tokens);
  flattenTokens("token-radius", theme.borderRadius, tokens);
  tokens["token-breakpoint-sm"] = `${theme.breakpoints.sm}px`;
  tokens["token-breakpoint-md"] = `${theme.breakpoints.md}px`;
  tokens["token-breakpoint-lg"] = `${theme.breakpoints.lg}px`;
  tokens["token-breakpoint-xl"] = `${theme.breakpoints.xl}px`;

  const declarationLines = Object.entries(tokens)
    .map(([token, tokenValue]) => `  --${token}: ${tokenValue};`)
    .join("\n");

  return `:root {\n${declarationLines}\n}\n`;
}

export function getTailwindThemeCss() {
  return [
    "@theme inline {",
    `  --color-primary: ${theme.colors.primary};`,
    `  --color-secondary: ${theme.colors.secondary};`,
    `  --color-accent: ${theme.colors.accent};`,
    `  --color-danger: ${theme.colors.danger};`,
    `  --color-success: ${theme.colors.success};`,
    `  --color-muted: ${theme.colors.muted};`,
    `  --color-background: ${theme.colors.background};`,
    `  --color-foreground: ${theme.colors.foreground};`,
    `  --color-surface: ${theme.colors.surface};`,
    `  --color-surface-strong: ${theme.colors.surfaceStrong};`,
    `  --color-border: ${theme.colors.border};`,
    `  --color-gray-dark: ${theme.colors.grayDark};`,
    `  --font-sans: ${theme.typography.fonts.sans};`,
    `  --text-xs: ${theme.typography.fontSizes.xs};`,
    `  --text-sm: ${theme.typography.fontSizes.sm};`,
    `  --text-md: ${theme.typography.fontSizes.md};`,
    `  --text-lg: ${theme.typography.fontSizes.lg};`,
    `  --text-xl: ${theme.typography.fontSizes.xl};`,
    `  --text-2xl: ${theme.typography.fontSizes["2xl"]};`,
    `  --font-weight-regular: ${theme.typography.fontWeights.regular};`,
    `  --font-weight-medium: ${theme.typography.fontWeights.medium};`,
    `  --font-weight-semibold: ${theme.typography.fontWeights.semibold};`,
    `  --font-weight-bold: ${theme.typography.fontWeights.bold};`,
    `  --spacing: ${theme.spacing[1]};`,
    `  --radius-sm: ${theme.borderRadius.sm};`,
    `  --radius-md: ${theme.borderRadius.md};`,
    `  --radius-lg: ${theme.borderRadius.lg};`,
    `  --radius-full: ${theme.borderRadius.full};`,
    `  --breakpoint-sm: ${theme.breakpoints.sm}px;`,
    `  --breakpoint-md: ${theme.breakpoints.md}px;`,
    `  --breakpoint-lg: ${theme.breakpoints.lg}px;`,
    `  --breakpoint-xl: ${theme.breakpoints.xl}px;`,
    "}",
  ].join("\n");
}

export type Theme = typeof theme;
