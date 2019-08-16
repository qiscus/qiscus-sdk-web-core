import pipe from 'callbag-pipe'
import observe from 'callbag-observe'

type Callbag<I, O> = {
  (start: 0, sink: Callbag<O, I>): void
  (data: 1, payload: I): void
  (end: 2, error?: Error): void
}

type Producer<O> = Callbag<void, O>
type Sink<I> = Callbag<I, void>
type Operator<A, B> = (source: Producer<A>) => Sink<B>

const interval = (period: number): Producer<number> => (start, sink) => {
  if (start !== 0) return
  let counter = 0
  sink(1, counter++)
  const intervalId = setInterval(() => {
    sink(1, counter++)
  }, period)
  sink(0, (t, d) => {
    if (t === 2) clearInterval(intervalId)
  })
}

const take = <A>(time: number): Operator<A, A> => (source: Producer<A>) => (start, sink) => {
  if (start !== 0) return
  let count = 0
  let sourceTalkback

  const talkback = (t, d) => {
  }

  source(0, (t, d) => {
    if (t === 0) {
      sourceTalkback = d
      sink(0, talkback)
    } else if (t === 1 && count++ < time) {
      sink(t, d)
    } else {
      sink(2)
      sourceTalkback && sourceTalkback(2)
    }
  })

}

pipe(
  interval(100),
  take(3),
  observe(data => console.log('data:', data))
)
