/**
 * A DOM for the test runner.
 *
 * Preloaded for every file rather than registered per test, so the environment
 * does not depend on which files `bun test` happens to run first — a global
 * that appears only when some other file asked for it is a source of failures
 * that reproduce on one machine and not another.
 *
 * happy-dom rather than a browser: it is a JavaScript implementation of the
 * DOM with no binary to launch, which is why it runs here at all. This machine
 * cannot run headless browsers.
 *
 * What it buys is the class of test that was previously impossible.
 * `renderToStaticMarkup` renders once, synchronously, to a string: it never
 * mounts, so no effect runs and nothing a component loads asynchronously ever
 * reaches the markup. Any assertion about such content passes or fails for the
 * same reason whatever the component does, which is not a test.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()
