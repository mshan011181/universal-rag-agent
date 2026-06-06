/**
 * LLM Model configuration for different environments and RAG patterns
 */

export interface ModelConfig {
  name: string
  environment: 'production' | 'development' | 'gcp'
  provider: string
  contextWindow: number
}

export const MODELS_BY_ENVIRONMENT: Record<string, Record<string, ModelConfig>> = {
  production: {
    synthesizer: {
      name: 'Claude 3.5 Sonnet',
      environment: 'production',
      provider: 'Anthropic',
      contextWindow: 200000,
    },
    retriever: {
      name: 'Claude 3.5 Sonnet',
      environment: 'production',
      provider: 'Anthropic',
      contextWindow: 200000,
    },
    grader: {
      name: 'Claude 3.5 Sonnet',
      environment: 'production',
      provider: 'Anthropic',
      contextWindow: 200000,
    },
    verifier: {
      name: 'Claude 3.5 Sonnet',
      environment: 'production',
      provider: 'Anthropic',
      contextWindow: 200000,
    },
  },
  development: {
    synthesizer: {
      name: 'Groq Mixtral 8x7B',
      environment: 'development',
      provider: 'Groq',
      contextWindow: 32000,
    },
    retriever: {
      name: 'Groq Mixtral 8x7B',
      environment: 'development',
      provider: 'Groq',
      contextWindow: 32000,
    },
    grader: {
      name: 'Groq Mixtral 8x7B',
      environment: 'development',
      provider: 'Groq',
      contextWindow: 32000,
    },
    verifier: {
      name: 'Groq Mixtral 8x7B',
      environment: 'development',
      provider: 'Groq',
      contextWindow: 32000,
    },
  },
  gcp: {
    synthesizer: {
      name: 'Gemini 2.0 Flash',
      environment: 'gcp',
      provider: 'Vertex AI (Google Cloud)',
      contextWindow: 1000000,
    },
    retriever: {
      name: 'Gemini 2.0 Flash',
      environment: 'gcp',
      provider: 'Vertex AI (Google Cloud)',
      contextWindow: 1000000,
    },
    grader: {
      name: 'Gemini 2.0 Flash',
      environment: 'gcp',
      provider: 'Vertex AI (Google Cloud)',
      contextWindow: 1000000,
    },
    verifier: {
      name: 'Gemini 2.0 Flash',
      environment: 'gcp',
      provider: 'Vertex AI (Google Cloud)',
      contextWindow: 1000000,
    },
  },
}

export const PATTERNS_INFO: Record<
  string,
  {
    name: string
    description: string
    useCase: string
    complexity: 'simple' | 'medium' | 'advanced'
  }
> = {
  naive_rag: {
    name: 'Naive RAG',
    description: 'Basic retrieval-augmented generation',
    useCase: 'Simple Q&A with straightforward documents',
    complexity: 'simple',
  },
  hyde: {
    name: 'HyDE',
    description: 'Hypothetical Document Embeddings',
    useCase: 'Improving retrieval for complex queries',
    complexity: 'medium',
  },
  query_rewriting: {
    name: 'Query Rewriting',
    description: 'Reformulate queries for better retrieval',
    useCase: 'Handling ambiguous or poorly-formed queries',
    complexity: 'medium',
  },
  crag: {
    name: 'CRAG',
    description: 'Corrective RAG with retrieval validation',
    useCase: 'Ensuring retrieval quality with validation',
    complexity: 'advanced',
  },
  self_rag: {
    name: 'Self-RAG',
    description: 'Self-reflective RAG with retrieval feedback',
    useCase: 'Iterative refinement of answers',
    complexity: 'advanced',
  },
  adaptive_rag: {
    name: 'Adaptive RAG',
    description: 'Dynamically adapt retrieval strategy',
    useCase: 'Context-aware retrieval adjustment',
    complexity: 'advanced',
  },
  flare: {
    name: 'FLARE',
    description: 'Frontier LLM-Augmented Retrieval',
    useCase: 'Generating retrieval queries on-the-fly',
    complexity: 'advanced',
  },
  speculative_rag: {
    name: 'Speculative RAG',
    description: 'Speculative generation with retrieval',
    useCase: 'Draft-and-revise answer generation',
    complexity: 'advanced',
  },
  modular_rag: {
    name: 'Modular RAG',
    description: 'Compose different RAG modules',
    useCase: 'Complex workflows with multiple steps',
    complexity: 'advanced',
  },
  agentic_rag: {
    name: 'Agentic RAG',
    description: 'Agent-based retrieval and reasoning',
    useCase: 'Multi-step reasoning with tools',
    complexity: 'advanced',
  },
  graph_rag: {
    name: 'Graph RAG',
    description: 'Knowledge graph enhanced retrieval',
    useCase: 'Structured knowledge retrieval',
    complexity: 'advanced',
  },
  conversational_rag: {
    name: 'Conversational RAG',
    description: 'Multi-turn conversation with history',
    useCase: 'Dialog with context maintenance',
    complexity: 'medium',
  },
  rag_fusion: {
    name: 'RAG Fusion',
    description: 'Ensemble retrieval from multiple queries',
    useCase: 'Comprehensive multi-perspective search',
    complexity: 'advanced',
  },
}
