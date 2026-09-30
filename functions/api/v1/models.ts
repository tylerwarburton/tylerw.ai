// GET /api/v1/models: the demo's allowed models, in OpenAI list format, so
// tools that list models before chatting (Cursor, Open WebUI, etc.) work.
import { handler, json } from '../_lib';
import { allowedModels } from './chat/completions';

export const onRequestGet = handler(async ({ env }) =>
  json({
    object: 'list',
    data: allowedModels(env).map((id) => ({ id, object: 'model', owned_by: id.split('/')[0] })),
  }),
);
