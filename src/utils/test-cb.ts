// type Callbag<I, O> = {
//   (t: 0, d: Callbag<O, I>): void;
//   (t: 1, d: I): void;
// };

type Callbag<I, O> = {
  (t: 0, d: Callbag<O, I>): void;
  (t: 1, d: I): void;
  (t: 2, d?: Error): void;
};
type Type = 0 | 1 | 2
type Payload<I> = null | I | Callbag<void, I>

type Source<T> = Callbag<void, T>;
type Sink<T> = Callbag<T, void>;

const map = <A, B>(f: (x: A) => B) => (input: Source<A>) => {
  const output: Source<B> = (start: 0|1|2, sink) => {
    if (start !== 0) return;
    input(0, (t, d) => {
      sink(t, t === 1 ? f(d) : d);
    })
  }
  return output;
}

const numberListenable: Source<number> = (t: Type, d) => {
  if (t !== 0) return;
  const sink: Callbag<number, void> = d;
  let counter = 0;
  setInterval(() => {
    sink(1, counter++);
  }, 1000);
}

const stringListenable = map((x: number) => '' + x)(numberListenable)

const numberSink: Sink<number> = (t: Type, d) => {
  if (t === 1) console.log(d)
}
const stringSink: Sink<string> = (t: Type, d) => {
  if (t === 1) console.log(d)
}

numberListenable(0, numberSink)
numberListenable(0, stringSink)
stringListenable(0, stringSink)
stringListenable(0, numberSink)
