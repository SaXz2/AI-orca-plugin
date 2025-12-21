import { conditionToQueryItem } from "../src/utils/query-builder";
import { assertEqual, test } from "./test-harness";

test("conditionToQueryItem converts ref condition with blockId", () => {
  const item = conditionToQueryItem({ type: "ref", blockId: 12345 });
  assertEqual((item as any).kind, 6);
  assertEqual((item as any).blockId, 12345);
});

test("conditionToQueryItem converts ref condition with zero blockId", () => {
  const item = conditionToQueryItem({ type: "ref", blockId: 0 });
  assertEqual((item as any).kind, 6);
  assertEqual((item as any).blockId, 0);
});
