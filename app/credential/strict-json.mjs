export class DuplicateJsonKeyError extends SyntaxError {
  constructor(key) {
    super(`duplicate JSON object key: ${key}`);
    this.name = "DuplicateJsonKeyError";
    this.key = key;
  }
}

export function assertNoDuplicateJsonKeys(source) {
  if (typeof source !== "string") throw new SyntaxError("JSON source must be text");
  let index = 0;

  const skipWhitespace = () => {
    while (index < source.length && /[\u0009\u000a\u000d\u0020]/u.test(source[index])) index += 1;
  };

  const parseString = () => {
    if (source[index] !== '"') throw new SyntaxError("expected JSON string");
    const start = index;
    index += 1;
    while (index < source.length) {
      const character = source[index];
      if (character === '"') {
        index += 1;
        return JSON.parse(source.slice(start, index));
      }
      if (character === "\\") {
        index += 1;
        if (index >= source.length) throw new SyntaxError("unterminated JSON escape");
        if (source[index] === "u") {
          if (!/^[0-9A-Fa-f]{4}$/u.test(source.slice(index + 1, index + 5))) {
            throw new SyntaxError("invalid JSON Unicode escape");
          }
          index += 5;
        } else {
          if (!/["\\/bfnrt]/u.test(source[index])) throw new SyntaxError("invalid JSON escape");
          index += 1;
        }
        continue;
      }
      if (character.charCodeAt(0) <= 0x1f) throw new SyntaxError("unescaped JSON control character");
      index += 1;
    }
    throw new SyntaxError("unterminated JSON string");
  };

  const parseNumber = () => {
    const match = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u);
    if (!match) throw new SyntaxError("invalid JSON number");
    index += match[0].length;
  };

  const parseLiteral = (literal) => {
    if (!source.startsWith(literal, index)) throw new SyntaxError("invalid JSON literal");
    index += literal.length;
  };

  const parseArray = () => {
    index += 1;
    skipWhitespace();
    if (source[index] === "]") {
      index += 1;
      return;
    }
    while (true) {
      parseValue();
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return;
      }
      if (source[index] !== ",") throw new SyntaxError("expected JSON array separator");
      index += 1;
      skipWhitespace();
    }
  };

  const parseObject = () => {
    index += 1;
    skipWhitespace();
    const keys = new Set();
    if (source[index] === "}") {
      index += 1;
      return;
    }
    while (true) {
      const key = parseString();
      if (keys.has(key)) throw new DuplicateJsonKeyError(key);
      keys.add(key);
      skipWhitespace();
      if (source[index] !== ":") throw new SyntaxError("expected JSON name separator");
      index += 1;
      skipWhitespace();
      parseValue();
      skipWhitespace();
      if (source[index] === "}") {
        index += 1;
        return;
      }
      if (source[index] !== ",") throw new SyntaxError("expected JSON object separator");
      index += 1;
      skipWhitespace();
    }
  };

  function parseValue() {
    skipWhitespace();
    const character = source[index];
    if (character === "{") return parseObject();
    if (character === "[") return parseArray();
    if (character === '"') return void parseString();
    if (character === "t") return parseLiteral("true");
    if (character === "f") return parseLiteral("false");
    if (character === "n") return parseLiteral("null");
    return parseNumber();
  }

  skipWhitespace();
  parseValue();
  skipWhitespace();
  if (index !== source.length) throw new SyntaxError("trailing JSON data");
}
