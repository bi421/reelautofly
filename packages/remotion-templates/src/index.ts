export { renderReel } from './render'
export { ProductShowcase } from './templates/ProductShowcase'
export { BeforeAfter } from './templates/BeforeAfter'
export { UGCStyle } from './templates/UGCStyle'

export const TEMPLATES = {
  ProductShowcase: 'ProductShowcase',
  BeforeAfter: 'BeforeAfter',
  UGCStyle: 'UGCStyle',
} as const

export type TemplateName = keyof typeof TEMPLATES
