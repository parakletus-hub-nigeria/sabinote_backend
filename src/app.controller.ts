import { Controller, Get, Query } from '@nestjs/common';
import { AppService } from './app.service';
import { PLATFORM_RELEASE_MANIFEST } from './common/config/release.manifest';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getRoot() {
    return {
      success: true,
      data: {
        name: 'SabiNote API',
        version: PLATFORM_RELEASE_MANIFEST.current.versionTag,
        codename: PLATFORM_RELEASE_MANIFEST.current.codename,
        curriculumBaseline: PLATFORM_RELEASE_MANIFEST.current.curriculumBaseline.tag,
        status: 'healthy',
        timestamp: new Date().toISOString(),
      },
    };
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      version: PLATFORM_RELEASE_MANIFEST.current.versionTag,
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('system/version')
  getVersion() {
    return {
      success: true,
      data: PLATFORM_RELEASE_MANIFEST.current,
    };
  }

  @Get('system/releases')
  getReleases() {
    return {
      success: true,
      data: {
        current: PLATFORM_RELEASE_MANIFEST.current,
        history: PLATFORM_RELEASE_MANIFEST.history,
      },
    };
  }

  @Get('system/ai-health')
  async getAiHealth(
    @Query('model') modelOverride?: string,
    @Query('testPlan') testPlan?: string,
  ) {
    const apiKey = process.env.OPENROUTER_API_KEY || '';
    const keyConfigured = !!apiKey;
    const keyPrefix = apiKey
      ? `${apiKey.substring(0, 10)}...${apiKey.substring(Math.max(0, apiKey.length - 4))}`
      : 'NOT_SET';
    const model = modelOverride || process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash';

    if (!keyConfigured || apiKey.startsWith('dev_')) {
      return {
        success: false,
        error: 'OPENROUTER_API_KEY is not configured with a valid key on the server',
        keyPrefix,
        model,
      };
    }

    try {
      const axiosModule = await import('axios');
      const axios = axiosModule.default;

      if (testPlan === 'true') {
        const testPrompt = `You are a master Nigerian Junior Secondary educator.
Generate a complete, inspection-ready LESSON PLAN for JSS 1 Business Studies on "Overview of Business".
Return ONLY valid JSON with keys: metadata, referenceBooks, instructionalMaterials, entryBehaviour, previousKnowledge, objectives, presentation, commonMisconceptions, differentiation, evaluation, summary, assignment.`;

        const start = Date.now();
        const response = await axios.post(
          'https://openrouter.ai/api/v1/chat/completions',
          {
            model,
            max_tokens: 3000,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content:
                  'You are an expert Nigerian curriculum specialist. You ONLY respond with valid JSON. No markdown code fences, no preamble.',
              },
              { role: 'user', content: testPrompt },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://sabinote.app',
              'X-Title': 'SabiNote Health Check',
            },
            timeout: 75_000,
          },
        );

        const durationMs = Date.now() - start;
        const raw: string = response.data?.choices?.[0]?.message?.content ?? '';
        let isJson = false;
        let parsedKeys: string[] = [];
        try {
          const parsed = JSON.parse(raw);
          isJson = true;
          parsedKeys = Object.keys(parsed);
        } catch {}

        return {
          success: true,
          keyPrefix,
          model,
          status: response.status,
          durationMs,
          rawLength: raw.length,
          isJson,
          parsedKeys,
          rawPreview: raw.slice(0, 300),
          usage: response.data?.usage,
        };
      }

      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model,
          max_tokens: 15,
          messages: [{ role: 'user', content: 'Say hello in one word' }],
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://sabinote.app',
            'X-Title': 'SabiNote Health Check',
          },
          timeout: 15_000,
        },
      );

      return {
        success: true,
        keyPrefix,
        model,
        status: response.status,
        reply: response.data?.choices?.[0]?.message?.content,
      };
    } catch (err: any) {
      return {
        success: false,
        keyPrefix,
        model,
        statusCode: err?.response?.status,
        statusText: err?.response?.statusText,
        errorData: err?.response?.data,
        errorMessage: err?.message,
      };
    }
  }
}

