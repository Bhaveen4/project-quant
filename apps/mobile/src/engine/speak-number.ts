const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

function belowThousand(n: number): string {
  if (n < 20) {
    return ONES[n];
  }
  if (n < 100) {
    const ten = Math.floor(n / 10);
    const one = n % 10;
    return one === 0 ? TENS[ten] : `${TENS[ten]}-${ONES[one]}`;
  }
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  if (rest === 0) {
    return `${ONES[hundred]} hundred`;
  }
  return `${ONES[hundred]} hundred ${belowThousand(rest)}`;
}

export function speakNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999) {
    return String(n);
  }
  if (n < 1000) {
    return belowThousand(n);
  }
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const head = `${ONES[thousands]} thousand`;
  if (rest === 0) {
    return head;
  }
  return `${head} ${belowThousand(rest)}`;
}

export function formatAddends(addends: number[]): string {
  return addends.join(" + ");
}

export function speakAddends(addends: number[]): string {
  return addends.map(speakNumber).join(" plus ");
}
