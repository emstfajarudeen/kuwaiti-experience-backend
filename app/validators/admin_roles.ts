import vine from '@vinejs/vine'

export const roleValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(120),
    description: vine.string().trim().maxLength(500).nullable().optional(),
    permissionKeys: vine.array(vine.string().trim().maxLength(120)).distinct(),
  })
)
