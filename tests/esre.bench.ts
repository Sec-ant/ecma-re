import { bench, describe } from "vitest";

import { emit } from "../src/emitter";
import { esre } from "../src/index";
import { parse } from "../src/parser";
import { transform } from "../src/transformer";

const cases = {
  literal: {
    pattern: "hello",
    flags: "",
    options: { ascii: false, loose: false },
  },
  asciiCharClass: {
    pattern: "^[a-zA-Z_][a-zA-Z0-9_]{0,31}$",
    flags: "",
    options: { ascii: true, loose: false },
  },
  unicodeHeavy: {
    pattern: String.raw`^(?P<word>\w+)(?:\s+|,\s*)(?P=word)\b$`,
    flags: "",
    options: { ascii: false, loose: false },
  },
  verbosePattern: {
    pattern: String.raw`(?x)
      ^
      (?P<year>\d{4})
      -
      (?P<month>\d{2})
      -
      (?P<day>\d{2})
      (?:[ T]\d{2}:\d{2}:\d{2})?
      $
    `,
    flags: "",
    options: { ascii: false, loose: false },
  },
  nestedLookarounds: {
    pattern: String.raw`(?<!foo)(?P<name>[A-Za-z_]\w{0,15})(?=\s*=)(?:\s*=\s*)(?!0\d)\d+(?:\.\d+)?$`,
    flags: "",
    options: { ascii: false, loose: false },
  },
} as const;

for (const [name, sample] of Object.entries(cases)) {
  describe(name, () => {
    const verboseMode = sample.flags.includes("x");
    const parsed = parse(sample.pattern, verboseMode);
    const reparsed =
      parsed.globalFlags.includes("x") && !verboseMode
        ? parse(sample.pattern, true)
        : parsed;
    const transformed = transform(
      reparsed.ast,
      reparsed.globalFlags,
      sample.flags,
      sample.options,
    );

    bench(`${name}: parse`, () => {
      parse(sample.pattern, verboseMode);
    });

    bench(`${name}: full-parse`, () => {
      const first = parse(sample.pattern, verboseMode);
      if (first.globalFlags.includes("x") && !verboseMode) {
        parse(sample.pattern, true);
      }
    });

    bench(`${name}: transform`, () => {
      transform(
        reparsed.ast,
        reparsed.globalFlags,
        sample.flags,
        sample.options,
      );
    });

    bench(`${name}: emit`, () => {
      emit(transformed.ast, transformed.needsVFlag);
    });

    bench(`${name}: esre`, () => {
      esre(sample.pattern, sample.flags, sample.options);
    });
  });
}
