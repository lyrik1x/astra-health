import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// T-502 criterion 6 (QA-405, D-23): no file in apps/api/src computes simulated time by hand.
// Everything goes through computeSimNow from @astra/contracts.
// Static check: looks for arithmetic with `factor` (`x * factor`, `factor * x`, `/ factor`, ...).
// Date comparisons (e.g. deliverAt <= serverSimNow) do not use `factor` and never match.

const srcDir = path.resolve(import.meta.dirname, "..", "src");
const generatedDir = path.join(srcDir, "generated");

/** Arithmetic operator next to an identifier or property named `factor`. */
const MANUAL_FACTOR_MATH = /\bfactor\b\s*[*/]|[*/]\s*(?:[\w$]+\??\.)*factor\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return fullPath === generatedDir ? [] : sourceFiles(fullPath);
    }
    return entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

/**
 * Removes quoted strings (route paths like "clock/factor") and comments
 * (documentation lines like ` * factor ...`), which are not code.
 * Template literals are kept, so `${a * factor}` is still detected.
 */
function stripNonCode(code: string): string {
  return code
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""')
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

function manualFormulaLines(code: string): string[] {
  return stripNonCode(code)
    .split("\n")
    .filter((line) => MANUAL_FACTOR_MATH.test(line))
    .map((line) => line.trim());
}

describe("single simulated-time formula (QA-405)", () => {
  it("the detector finds factor arithmetic and ignores deliverAt comparisons and comments", () => {
    expect(manualFormulaLines("const ms = (realNow - realEpoch) * clock.factor;")).toHaveLength(1);
    expect(manualFormulaLines("const ms = factor * elapsed;")).toHaveLength(1);
    expect(manualFormulaLines("const real = sim / row.factor;")).toHaveLength(1);
    expect(manualFormulaLines("x = elapsed*factor")).toHaveLength(1);
    expect(manualFormulaLines("const text = `${elapsed * clock.factor}`;")).toHaveLength(1);

    expect(manualFormulaLines("return Date.parse(deliverAt) <= Date.parse(serverSimNow);")).toHaveLength(0);
    expect(manualFormulaLines("where: { deliverAt: { lte: simNow } }")).toHaveLength(0);
    expect(manualFormulaLines("data: { factor: next.factor, clockVersion: v + 1 }")).toHaveLength(0);
    expect(manualFormulaLines("if (current.factor === factor) return current;")).toHaveLength(0);
    expect(manualFormulaLines("/**\n * factor is multiplied in contracts\n */")).toHaveLength(0);
    expect(manualFormulaLines("// simNow = simEpoch + elapsed * factor")).toHaveLength(0);
    expect(manualFormulaLines('@Post("clock/factor")')).toHaveLength(0);
    expect(manualFormulaLines("request.post('/api/mission/clock/factor')")).toHaveLength(0);
  });

  it("no file in apps/api/src (excluding src/generated) multiplies or divides by factor", () => {
    const files = sourceFiles(srcDir);
    expect(files).toContain(path.join(srcDir, "missions", "mission-clock.service.ts"));
    expect(files.some((file) => file.startsWith(generatedDir))).toBe(false);

    const offenders = files.flatMap((file) =>
      manualFormulaLines(readFileSync(file, "utf8")).map((line) => `${path.relative(srcDir, file)}: ${line}`),
    );
    expect(offenders).toEqual([]);
  });
});
