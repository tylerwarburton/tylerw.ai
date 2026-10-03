// GET /api/v1/models: the demo's allowed models, in OpenAI list format, so
// tools that list models before chatting (Cursor, Open WebUI, etc.) work.
import { handler, json, JEV_MODEL } from '../_lib';
import { allowedModels } from './chat/completions';

export const onRequestGet = handler(async ({ env }) =>
  json({
    object: 'list',
    data: [{id:JEV_MODEL,object:'model',owned_by:'typesafe',purpose:'decisions',endpoint:'/api/v1/systemone'},...allowedModels(env).map((id) => ({ id, object: 'model', owned_by: id.split('/')[0],purpose:'text',endpoint:'/api/v1/chat/completions' }))],
  }),
);
