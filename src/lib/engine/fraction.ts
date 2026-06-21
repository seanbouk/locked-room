// Exact rational arithmetic backed by BigInt.
//
// The whole point of the deduction engine is that "solved" means *provably
// determined*, never "two floats look close". So every number that flows
// through the linear solver is an exact rational. No floating point, ever.

export class Fraction {
  // Always stored normalised: gcd(n, d) === 1, d > 0, and 0 is (0/1).
  readonly n: bigint;
  readonly d: bigint;

  private constructor(n: bigint, d: bigint) {
    this.n = n;
    this.d = d;
  }

  static of(n: number | bigint, d: number | bigint = 1n): Fraction {
    let nn = BigInt(n);
    let dd = BigInt(d);
    if (dd === 0n) throw new Error('Fraction: zero denominator');
    if (dd < 0n) {
      nn = -nn;
      dd = -dd;
    }
    const g = gcd(abs(nn), dd);
    return new Fraction(nn / g, dd / g);
  }

  static readonly ZERO = Fraction.of(0n);
  static readonly ONE = Fraction.of(1n);

  add(o: Fraction): Fraction {
    return Fraction.of(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Fraction): Fraction {
    return Fraction.of(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Fraction): Fraction {
    return Fraction.of(this.n * o.n, this.d * o.d);
  }
  div(o: Fraction): Fraction {
    if (o.n === 0n) throw new Error('Fraction: division by zero');
    return Fraction.of(this.n * o.d, this.d * o.n);
  }
  neg(): Fraction {
    return new Fraction(-this.n, this.d);
  }

  isZero(): boolean {
    return this.n === 0n;
  }
  equals(o: Fraction): boolean {
    // Both normalised, so component equality is value equality.
    return this.n === o.n && this.d === o.d;
  }

  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }
  toString(): string {
    return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`;
  }
}

function abs(x: bigint): bigint {
  return x < 0n ? -x : x;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a === 0n ? 1n : a;
}
