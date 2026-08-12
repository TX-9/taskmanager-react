# The `memo` + Inline `children` Pitfall

## The Problem

`React.memo` skips a re-render only when every prop is **referentially equal** (`===`) to what it was last render — it does a **shallow comparison**, not a deep one.

If a prop is an object, array, or JSX element, and you create a _new one_ each render — even with identical-looking contents — `memo` sees it as "changed" and re-renders anyway.

### The sneaky case

Building a compound component's `children` **inline inside a `.map()`** hands it a brand-new object every render, defeating `memo` on the parent — even if every individual prop looks "the same."

## ❌ Broken: memo defeated

```tsx
// --- Definitions ---
const Card = memo(({ children }: { children: React.ReactNode }) => {
  return <div className="card">{children}</div>;
});

Card.Header = memo(({ title }: { title: string }) => {
  return <h3>{title}</h3>;
});

// --- Call site (inside parent component) ---
items.map((item) => (
  <Card key={item.id}>
    <Card.Header title={item.title} />
  </Card>
));
```

**What's happening:**

1. `Card` _is_ memoized — but the memoization happens at the wrong boundary.
2. Every time the parent re-renders, `.map()` re-runs and builds a **new `children` object** for each `Card` (via `<Card.Header ... />`), even if `item.title` hasn't changed.
3. `memo` shallow-compares `Card`'s props → sees `children` as a new reference → treats it as "changed" → re-renders `Card` anyway.
4. **Net effect:** `memo` exists but does nothing. Every item re-renders whenever the parent re-renders.

## ✅ Fixed: memo actually works

```tsx
// --- Definitions (Card stays the same) ---
const Card = memo(({ children }: { children: React.ReactNode }) => {
  return <div className="card">{children}</div>;
});

Card.Header = memo(({ title }: { title: string }) => {
  return <h3>{title}</h3>;
});

// --- New: composition wrapped in its own memoized component ---
const Row = memo(({ item }: { item: Item }) => (
  <Card>
    <Card.Header title={item.title} />
  </Card>
));

// --- Call site (inside parent component) ---
items.map((item) => <Row key={item.id} item={item} />);
```

**What changed:**

1. The composition (`<Card><Card.Header/></Card>`) moves _inside_ a new component, `Row`, which is itself memoized.
2. `.map()` now only creates `<Row item={item} />` elements — and `item` is a stable reference (assuming the array/objects aren't rebuilt upstream).
3. `memo` on `Row` compares the `item` prop by reference: unchanged `item` → skip re-render entirely, including the `Card` / `Card.Header` construction inside it.
4. JSX still creates new objects every time it's evaluated — but now that only happens **when `item` actually changes**, because `Row`'s memo check stops the render before it ever reaches that JSX.

## Why `<Card.Header title={item.title} />` Creates a New Object

JSX is just syntax sugar. This line:

```tsx
<Card.Header title={item.title} />
```

compiles down to a plain function call:

```tsx
React.createElement(Card.Header, { title: item.title });
```

`React.createElement` doesn't return markup — it returns a **plain JavaScript object** describing what to render, roughly:

```js
{
  type: Card.Header,
  props: { title: item.title },
  key: null,
  // ...internal fields like $$typeof, ref, etc.
}
```

That object is what gets passed as the `children` prop to `<Card>`.

**The key issue:** every time this line executes — i.e., every time `.map()` runs during a re-render — `React.createElement` is called again and returns a **brand-new object**, with a new memory reference, even if `item.title` is the exact same string as before.

```js
const a = React.createElement(Card.Header, { title: "Hello" });
const b = React.createElement(Card.Header, { title: "Hello" });

a === b; // false — different object references, despite identical `title`
```

So when `memo` on `Card` shallow-compares `children` from the previous render (`a`) against `children` from the current render (`b`), it sees two different object references. It has no way to look "inside" and notice that `props.title` is unchanged — shallow comparison only checks `===` at the top level, not deep equality. Since `a !== b`, `memo` concludes the prop changed, and `Card` re-renders.

This is exactly why moving the JSX composition into `Row` fixes it: `Row`'s `memo` check happens _before_ `React.createElement(Card.Header, ...)` ever runs, so the new-object problem only occurs when `item` itself changes — not on every parent render.

## Core Difference

|                    | Original                                                            | Fixed                                            |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------ |
| Where `memo` sits  | On `Card`, but `children` is created _outside_ it, at the call site | On `Row`, wrapping the _entire_ composition      |
| What memo compares | `children` (always a new object)                                    | `item` (stable reference)                        |
| Result             | Memo defeated — re-renders every time                               | Memo works — re-renders only when `item` changes |

## Takeaway

The fix isn't adding more memoization — it's **relocating the memo boundary** so it wraps something structurally stable (`item`), instead of wrapping a component whose critical prop (`children`) is guaranteed to be a new object every render.

**General rule:** if you're composing components inline inside a loop or map, and the parent is memoized, move that composition into its own memoized component one level down.
