/**
 * The renderer contract.
 *
 * C3 — read-only (FR-VZ-08): "A Viewer shall not be able to alter underlying
 * data through a Widget." That is enforced here by construction rather than by
 * convention: `RendererProps` carries no callbacks, no port, no dispatch and no
 * mutable reference. A renderer is handed rows and told to draw them. There is
 * nothing it *could* call to write, so no renderer author has to remember not
 * to.
 *
 * Presentation state a renderer owns internally — a hovered point, an expanded
 * table row — is fine. It never leaves the renderer.
 */

import type { ReactNode } from 'react'
import type { Dataset } from '../domain/dataset'
import type { DatasetRow } from '../domain/query'
import type { FieldMapping } from '../domain/widget'

export interface RendererProps {
  readonly rows: readonly DatasetRow[]
  /** The bound Dataset's description — for labels, formatting, Field lookup. */
  readonly dataset: Dataset
  readonly mapping: FieldMapping
  readonly presentation: Readonly<Record<string, unknown>>
}

export type Renderer = (props: RendererProps) => ReactNode

export interface RendererRegistration {
  /** Must match an id in the Visualization Type manifest. */
  visualizationTypeId: string
  render: Renderer
}

const renderers = new Map<string, Renderer>()

export function registerRenderer(registration: RendererRegistration): void {
  renderers.set(registration.visualizationTypeId, registration.render)
}

export function getRenderer(visualizationTypeId: string): Renderer | undefined {
  return renderers.get(visualizationTypeId)
}

export function registeredRendererIds(): string[] {
  return Array.from(renderers.keys())
}
