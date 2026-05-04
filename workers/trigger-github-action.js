export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || 'https://mkmkkk54.github.io',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
    }

    const owner = env.GITHUB_OWNER || 'mkmkkk54';
    const repo = env.GITHUB_REPO || 'github-finance';
    const workflow = env.GITHUB_WORKFLOW || 'update-and-deploy.yml';
    const ref = env.GITHUB_REF || 'main';

    if (!env.GITHUB_TOKEN) {
      return new Response('Missing GITHUB_TOKEN secret', { status: 500, headers: corsHeaders });
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'github-finance-refresh-worker'
      },
      body: JSON.stringify({ ref })
    });

    if (!response.ok) {
      const text = await response.text();
      return new Response(`GitHub API error: ${response.status} ${text}`, { status: 502, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ ok: true, message: 'Workflow dispatched' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
