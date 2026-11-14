// Compuerta (M-2): confirma que Jest + ts-jest ESM funcionan antes de las demás pruebas.
describe("jest smoke", () => {
  it("runs a TypeScript test", () => {
    const value: number = 1 + 1;
    expect(value).toBe(2);
  });
});
