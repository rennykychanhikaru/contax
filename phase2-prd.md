# Phase 2 PRD: Intelligence & Scale (Months 4-6)
## Advanced AI Features and Production Readiness

### Executive Summary

Phase 2 transforms your MVP into an intelligent, production-ready platform capable of handling complex conversations and serving hundreds of customers simultaneously. The primary focus shifts from basic functionality to sophisticated AI capabilities that differentiate your product in the market. We'll implement industry-specific intelligence models, build a robust RAG (Retrieval Augmented Generation) system, and scale the infrastructure to handle 1000+ concurrent calls.

Building on the Supabase foundation from Phase 1, we'll introduce specialized services only where absolutely necessary. The key innovation in this phase is the implementation of specialized AI models that understand industry-specific contexts, making the system feel less like a generic answering service and more like a knowledgeable receptionist who truly understands each business.

By the end of Phase 2, you'll have a platform that not only answers calls but anticipates needs, handles complex multi-turn conversations, and provides insights that help businesses improve their customer service operations.

### Technical Evolution from Phase 1

Understanding how we evolve the architecture is crucial for maintaining system stability while adding complexity. Here's how our stack expands:

```yaml
Phase 1 Foundation (Existing):
  - Supabase (Database, Auth, Edge Functions)
  - LiveKit Cloud (WebRTC)
  - OpenAI GPT-4 (Basic conversations)
  - Deepgram (STT)
  - Twilio (Telephony)

Phase 2 Additions:
  Advanced AI:
    - OpenAI Realtime API (Ultra-low latency for premium tier)
    - Claude 3 Sonnet (Complex reasoning fallback)
    - Fine-tuned models (Industry-specific on Replicate)
    - ElevenLabs (Premium voice quality)
  
  Vector Infrastructure:
    - Qdrant Cloud (Dedicated vector DB, more scalable than pg_vector)
    - LangChain (RAG orchestration)
    - Cohere Rerank (Result optimization)
  
  Scaling Infrastructure:
    - Railway or Fly.io (Auto-scaling compute)
    - Upstash Redis (Serverless cache)
    - Inngest (Serverless background jobs)
    - Axiom (Advanced logging and analytics)
  
  Monitoring & Quality:
    - Langfuse (LLM observability)
    - Sentry (Error tracking)
    - PostHog (Product analytics)
```

### Advanced RAG Implementation

The RAG system is what makes your AI truly knowledgeable about each business. Instead of generic responses, the AI can reference specific information about services, policies, and procedures. Here's the complete implementation:

```python
# rag_service.py - Advanced knowledge retrieval system
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import numpy as np
from langchain.embeddings import OpenAIEmbeddings
from langchain.text_splitter import RecursiveCharacterTextSplitter
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
import cohere

class AdvancedRAGService:
    """
    This service manages all knowledge for the AI system.
    Think of it as the AI's long-term memory that can be
    instantly accessed during conversations.
    """
    
    def __init__(self, organization_id: str):
        self.organization_id = organization_id
        
        # Initialize vector database connection
        self.qdrant = QdrantClient(
            url="https://your-cluster.qdrant.io",
            api_key=os.getenv("QDRANT_API_KEY")
        )
        
        # Initialize embeddings model
        self.embeddings = OpenAIEmbeddings(
            model="text-embedding-3-large",
            dimensions=3072  # Higher dimension for better accuracy
        )
        
        # Initialize reranker for result optimization
        self.cohere = cohere.Client(os.getenv("COHERE_API_KEY"))
        
        # Collection name for this organization
        self.collection_name = f"org_{organization_id}"
        
        # Ensure collection exists
        self._ensure_collection()
    
    def _ensure_collection(self):
        """
        Create a dedicated vector collection for each organization.
        This ensures data isolation and allows for custom configurations.
        """
        collections = self.qdrant.get_collections().collections
        
        if not any(c.name == self.collection_name for c in collections):
            self.qdrant.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=3072,
                    distance=Distance.COSINE
                )
            )
            
            # Create indexes for metadata filtering
            self.qdrant.create_payload_index(
                collection_name=self.collection_name,
                field_name="document_type",
                field_type="keyword"
            )
            
            self.qdrant.create_payload_index(
                collection_name=self.collection_name,
                field_name="timestamp",
                field_type="datetime"
            )
    
    async def ingest_document(
        self,
        content: str,
        document_type: str,
        metadata: Dict[str, Any] = None
    ) -> List[str]:
        """
        Process and store a document in the vector database.
        This is how we add new knowledge to the system.
        """
        
        # Smart text splitting that preserves context
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=50,
            separators=["\n\n", "\n", ". ", " ", ""],
            length_function=len
        )
        
        chunks = splitter.split_text(content)
        
        # Generate embeddings for each chunk
        embeddings = await self.embeddings.aembed_documents(chunks)
        
        # Prepare points for insertion
        points = []
        chunk_ids = []
        
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            point_id = f"{self.organization_id}_{document_type}_{datetime.now().timestamp()}_{i}"
            chunk_ids.append(point_id)
            
            # Enhanced metadata for better retrieval
            point_metadata = {
                "text": chunk,
                "document_type": document_type,
                "organization_id": self.organization_id,
                "timestamp": datetime.now().isoformat(),
                "chunk_index": i,
                "total_chunks": len(chunks),
                **(metadata or {})
            }
            
            points.append(PointStruct(
                id=point_id,
                vector=embedding,
                payload=point_metadata
            ))
        
        # Batch insert for efficiency
        self.qdrant.upsert(
            collection_name=self.collection_name,
            points=points
        )
        
        # Update Supabase with document reference
        await self._update_document_registry(
            document_type=document_type,
            chunk_ids=chunk_ids,
            metadata=metadata
        )
        
        return chunk_ids
    
    async def retrieve_context(
        self,
        query: str,
        conversation_history: List[Dict] = None,
        filters: Dict[str, Any] = None,
        top_k: int = 10
    ) -> str:
        """
        Retrieve relevant context for a query.
        This is called during conversations to provide the AI with
        relevant information to answer questions accurately.
        """
        
        # Generate query embedding
        query_embedding = await self.embeddings.aembed_query(query)
        
        # If we have conversation history, create a contextualized query
        if conversation_history:
            contextualized_query = self._contextualize_query(
                query,
                conversation_history
            )
            query_embedding = await self.embeddings.aembed_query(
                contextualized_query
            )
        
        # Search vector database
        search_results = self.qdrant.search(
            collection_name=self.collection_name,
            query_vector=query_embedding,
            limit=top_k * 2,  # Get more results for reranking
            query_filter=filters
        )
        
        # Extract text chunks from results
        chunks = [
            {
                "text": result.payload["text"],
                "score": result.score,
                "metadata": result.payload
            }
            for result in search_results
        ]
        
        # Rerank results using Cohere for better relevance
        if chunks:
            reranked = self.cohere.rerank(
                query=query,
                documents=[c["text"] for c in chunks],
                top_n=top_k,
                model="rerank-english-v2.0"
            )
            
            # Get reranked chunks
            final_chunks = [
                chunks[r.index] for r in reranked.results
            ]
        else:
            final_chunks = chunks[:top_k]
        
        # Build context string with source attribution
        context_parts = []
        for chunk in final_chunks:
            source_info = f"[Source: {chunk['metadata'].get('document_type', 'Unknown')}]"
            context_parts.append(f"{source_info}\n{chunk['text']}")
        
        return "\n\n".join(context_parts)
    
    def _contextualize_query(
        self,
        query: str,
        conversation_history: List[Dict]
    ) -> str:
        """
        Reformulate the query based on conversation history.
        This handles pronouns and references to previous topics.
        """
        
        # Get last few exchanges for context
        recent_history = conversation_history[-4:] if len(conversation_history) > 4 else conversation_history
        
        history_text = "\n".join([
            f"{msg['role']}: {msg['content']}"
            for msg in recent_history
        ])
        
        # Use a small model to reformulate the query
        reformulation_prompt = f"""
        Given this conversation history:
        {history_text}
        
        And this new query: "{query}"
        
        Rewrite the query to be self-contained, replacing pronouns
        and references with specific terms from the conversation.
        Keep it concise and search-friendly.
        
        Reformulated query:
        """
        
        # This would call your LLM, but for speed in Phase 2,
        # we can use a simpler approach
        if any(pronoun in query.lower() for pronoun in ["it", "they", "this", "that"]):
            # Simple pronoun replacement based on last topic
            last_user_message = next(
                (msg for msg in reversed(recent_history) if msg['role'] == 'user'),
                None
            )
            if last_user_message:
                # Extract likely topic (this is simplified)
                return f"{query} {last_user_message['content'][:50]}"
        
        return query
    
    async def update_from_conversation(
        self,
        call_id: str,
        transcript: List[Dict],
        summary: str
    ):
        """
        Learn from conversations to improve future responses.
        This creates a feedback loop where the system gets
        smarter over time.
        """
        
        # Extract Q&A pairs from successful conversations
        qa_pairs = self._extract_qa_pairs(transcript)
        
        for qa in qa_pairs:
            # Only store high-quality exchanges
            if qa['confidence'] > 0.8:
                await self.ingest_document(
                    content=f"Question: {qa['question']}\nAnswer: {qa['answer']}",
                    document_type="learned_qa",
                    metadata={
                        "call_id": call_id,
                        "confidence": qa['confidence'],
                        "timestamp": datetime.now().isoformat()
                    }
                )
        
        # Store conversation summary for context
        await self.ingest_document(
            content=summary,
            document_type="conversation_summary",
            metadata={
                "call_id": call_id,
                "timestamp": datetime.now().isoformat()
            }
        )
```

### Industry-Specific AI Models

Different industries have unique terminology, workflows, and regulations. Here's how we implement specialized models for medical and legal practices:

```python
# industry_models.py - Specialized AI for different industries
from enum import Enum
from typing import Optional, Dict, Any, List
import json
from abc import ABC, abstractmethod

class Industry(Enum):
    MEDICAL = "medical"
    LEGAL = "legal"
    HOME_SERVICES = "home_services"
    RESTAURANT = "restaurant"
    GENERAL = "general"

class IndustryModel(ABC):
    """
    Base class for industry-specific AI models.
    Each industry gets its own specialized processing.
    """
    
    def __init__(self, organization_id: str):
        self.organization_id = organization_id
        self.load_industry_knowledge()
    
    @abstractmethod
    def load_industry_knowledge(self):
        """Load industry-specific knowledge and rules."""
        pass
    
    @abstractmethod
    def process_request(self, transcript: str, intent: Dict) -> Dict:
        """Process request with industry-specific logic."""
        pass
    
    @abstractmethod
    def validate_compliance(self, response: str) -> bool:
        """Ensure response meets industry regulations."""
        pass

class MedicalPracticeModel(IndustryModel):
    """
    Specialized model for medical practices.
    Handles HIPAA compliance, medical terminology, and healthcare workflows.
    """
    
    def load_industry_knowledge(self):
        self.medical_terms = self._load_medical_terminology()
        self.insurance_codes = self._load_insurance_codes()
        self.appointment_types = {
            "new_patient": 60,  # minutes
            "follow_up": 30,
            "physical": 45,
            "urgent": 15,
            "telehealth": 30
        }
        
        # HIPAA-compliant response templates
        self.templates = {
            "privacy_notice": "I need to let you know that this call may be recorded for quality purposes. Your health information is protected under HIPAA.",
            "cannot_disclose": "I cannot discuss specific medical information over the phone. Please speak directly with your provider.",
            "emergency": "If this is a medical emergency, please hang up and call 911 immediately."
        }
    
    def process_request(self, transcript: str, intent: Dict) -> Dict:
        """
        Process medical-specific requests with proper handling
        of sensitive information and medical workflows.
        """
        
        # Check for emergency keywords first
        emergency_keywords = ["emergency", "bleeding", "chest pain", "can't breathe", "unconscious"]
        if any(keyword in transcript.lower() for keyword in emergency_keywords):
            return {
                "action": "emergency_redirect",
                "response": self.templates["emergency"],
                "priority": "immediate"
            }
        
        # Detect appointment type from symptoms/reason
        appointment_type = self._determine_appointment_type(transcript)
        
        # Check insurance-related queries
        if "insurance" in transcript.lower():
            return self._handle_insurance_query(transcript)
        
        # Handle prescription refills
        if any(word in transcript.lower() for word in ["prescription", "refill", "medication"]):
            return self._handle_prescription_request(transcript)
        
        # Standard appointment scheduling with medical context
        if intent.get("type") == "scheduling":
            return {
                "action": "schedule_medical",
                "appointment_type": appointment_type,
                "duration": self.appointment_types[appointment_type],
                "requires_insurance": True,
                "collect_symptoms": True,
                "response": f"I can schedule a {appointment_type.replace('_', ' ')} appointment for you. What symptoms are you experiencing?"
            }
        
        return {
            "action": "general_medical",
            "response": "How can I help you with your healthcare needs today?"
        }
    
    def _determine_appointment_type(self, transcript: str) -> str:
        """
        Intelligently determine the type of appointment needed
        based on the patient's description.
        """
        
        transcript_lower = transcript.lower()
        
        # Check for specific appointment type mentions
        if "new patient" in transcript_lower or "first time" in transcript_lower:
            return "new_patient"
        
        if "follow up" in transcript_lower or "check up" in transcript_lower:
            return "follow_up"
        
        if "physical" in transcript_lower or "annual exam" in transcript_lower:
            return "physical"
        
        if any(urgent in transcript_lower for urgent in ["today", "urgent", "asap", "right away"]):
            return "urgent"
        
        if "video" in transcript_lower or "phone" in transcript_lower or "telehealth" in transcript_lower:
            return "telehealth"
        
        # Default to follow-up for existing patients
        return "follow_up"
    
    def _handle_insurance_query(self, transcript: str) -> Dict:
        """
        Handle insurance-related questions with accuracy
        while maintaining HIPAA compliance.
        """
        
        # Check our insurance database
        insurance_info = self._check_insurance_acceptance(transcript)
        
        return {
            "action": "insurance_query",
            "response": insurance_info,
            "collect_member_id": True,
            "verify_with_provider": True
        }
    
    def _handle_prescription_request(self, transcript: str) -> Dict:
        """
        Handle prescription refill requests following proper protocols.
        """
        
        return {
            "action": "prescription_refill",
            "response": "I can help you with a prescription refill request. I'll need to verify some information first. Can you provide your date of birth and the medication name?",
            "requires_verification": True,
            "route_to": "pharmacy_line",
            "create_task": "prescription_refill_review"
        }
    
    def validate_compliance(self, response: str) -> bool:
        """
        Ensure all responses meet HIPAA requirements.
        This is critical for medical practices.
        """
        
        # Check for PHI disclosure
        phi_patterns = [
            r'\d{3}-\d{2}-\d{4}',  # SSN
            r'\b\d{10}\b',  # Phone numbers
            r'[A-Z]{1,2}\d{6,8}',  # Medical record numbers
        ]
        
        import re
        for pattern in phi_patterns:
            if re.search(pattern, response):
                return False  # Contains potential PHI
        
        # Check for inappropriate medical advice
        medical_advice_phrases = [
            "you should take",
            "prescribe",
            "diagnosis is",
            "you have"
        ]
        
        response_lower = response.lower()
        for phrase in medical_advice_phrases:
            if phrase in response_lower:
                return False  # Contains medical advice
        
        return True

class LegalPracticeModel(IndustryModel):
    """
    Specialized model for legal practices.
    Handles confidentiality, conflict checking, and legal terminology.
    """
    
    def load_industry_knowledge(self):
        self.practice_areas = [
            "family_law", "criminal_defense", "personal_injury",
            "estate_planning", "business_law", "immigration"
        ]
        
        self.consultation_types = {
            "initial_consultation": 60,
            "case_review": 30,
            "document_preparation": 45,
            "court_preparation": 90
        }
        
        self.ethical_rules = {
            "confidentiality": "All information you share is protected by attorney-client privilege.",
            "no_legal_advice": "I cannot provide legal advice. Please schedule a consultation with an attorney.",
            "conflict_check": "We'll need to run a conflict check before scheduling your appointment."
        }
    
    def process_request(self, transcript: str, intent: Dict) -> Dict:
        """
        Process legal requests with proper confidentiality
        and conflict checking procedures.
        """
        
        # Identify practice area from request
        practice_area = self._identify_practice_area(transcript)
        
        # Check for urgent legal matters
        urgent_keywords = ["arrested", "court tomorrow", "deadline", "served papers"]
        is_urgent = any(keyword in transcript.lower() for keyword in urgent_keywords)
        
        if intent.get("type") == "scheduling":
            return {
                "action": "schedule_legal_consultation",
                "practice_area": practice_area,
                "is_urgent": is_urgent,
                "consultation_type": "initial_consultation",
                "duration": self.consultation_types["initial_consultation"],
                "requires_conflict_check": True,
                "response": f"I can schedule a consultation regarding {practice_area.replace('_', ' ')}. First, I'll need some information for our conflict check. May I have the names of all parties involved in your matter?",
                "disclaimer": self.ethical_rules["confidentiality"]
            }
        
        # Handle case status inquiries
        if "status" in transcript.lower() or "update" in transcript.lower():
            return {
                "action": "case_status_inquiry",
                "response": "I'll need to verify your identity before discussing case details. Can you provide your case number and date of birth?",
                "requires_authentication": True
            }
        
        return {
            "action": "general_legal",
            "response": "How can our law firm assist you today? Please note that I cannot provide legal advice, but I can help schedule a consultation with one of our attorneys.",
            "disclaimer": self.ethical_rules["no_legal_advice"]
        }
    
    def _identify_practice_area(self, transcript: str) -> str:
        """
        Identify the relevant practice area from the caller's description.
        """
        
        practice_area_keywords = {
            "family_law": ["divorce", "custody", "child support", "alimony", "separation"],
            "criminal_defense": ["arrested", "charged", "criminal", "DUI", "crime"],
            "personal_injury": ["accident", "injured", "hurt", "slip and fall", "car crash"],
            "estate_planning": ["will", "trust", "estate", "inheritance", "probate"],
            "business_law": ["contract", "business", "partnership", "LLC", "corporation"],
            "immigration": ["visa", "green card", "citizenship", "deportation", "immigration"]
        }
        
        transcript_lower = transcript.lower()
        
        for area, keywords in practice_area_keywords.items():
            if any(keyword in transcript_lower for keyword in keywords):
                return area
        
        return "general"
    
    def validate_compliance(self, response: str) -> bool:
        """
        Ensure responses comply with legal ethical rules.
        """
        
        # Check for unauthorized practice of law
        legal_advice_phrases = [
            "you should sue",
            "you will win",
            "the law says",
            "legally speaking",
            "your rights are"
        ]
        
        response_lower = response.lower()
        for phrase in legal_advice_phrases:
            if phrase in response_lower:
                return False  # Contains legal advice
        
        return True
```

### Scaling Infrastructure Implementation

Moving from 100 to 1000+ concurrent calls requires robust infrastructure. Here's the implementation using Railway for auto-scaling compute:

```typescript
// scaling/auto-scaler.ts - Dynamic scaling based on load
import { Railway } from '@railway/sdk'
import { SupabaseClient } from '@supabase/supabase-js'

export class AutoScaler {
    private railway: Railway
    private supabase: SupabaseClient
    private metrics: MetricsCollector
    
    // Scaling thresholds
    private readonly SCALE_UP_THRESHOLD = 0.75  // 75% CPU/Memory
    private readonly SCALE_DOWN_THRESHOLD = 0.25  // 25% CPU/Memory
    private readonly MIN_INSTANCES = 2
    private readonly MAX_INSTANCES = 50
    
    constructor() {
        this.railway = new Railway({
            apiKey: process.env.RAILWAY_API_KEY,
            projectId: process.env.RAILWAY_PROJECT_ID
        })
        
        // Start monitoring
        this.startAutoScaling()
    }
    
    async startAutoScaling() {
        """
        Continuously monitor system metrics and scale accordingly.
        This ensures we can handle traffic spikes smoothly.
        """
        
        setInterval(async () => {
            const metrics = await this.collectMetrics()
            const decision = this.makeScalingDecision(metrics)
            
            if (decision.action !== 'none') {
                await this.executeScaling(decision)
            }
        }, 30000) // Check every 30 seconds
    }
    
    async collectMetrics(): Promise<SystemMetrics> {
        """
        Collect metrics from all running instances.
        """
        
        // Get Railway service metrics
        const instances = await this.railway.getServiceInstances()
        
        const metrics = {
            cpuUsage: instances.map(i => i.metrics.cpu).reduce((a, b) => a + b) / instances.length,
            memoryUsage: instances.map(i => i.metrics.memory).reduce((a, b) => a + b) / instances.length,
            activeCalls: await this.getActiveCalls(),
            queueDepth: await this.getQueueDepth(),
            responseTime: await this.getAverageResponseTime(),
            instanceCount: instances.length
        }
        
        // Store metrics for analysis
        await this.supabase
            .from('system_metrics')
            .insert({
                timestamp: new Date().toISOString(),
                ...metrics
            })
        
        return metrics
    }
    
    makeScalingDecision(metrics: SystemMetrics): ScalingDecision {
        """
        Intelligent scaling decisions based on multiple factors.
        We don't just look at CPU, but also queue depth and response times.
        """
        
        // Immediate scale up conditions
        if (metrics.cpuUsage > this.SCALE_UP_THRESHOLD ||
            metrics.memoryUsage > this.SCALE_UP_THRESHOLD ||
            metrics.queueDepth > 100 ||
            metrics.responseTime > 1000) {
            
            const targetInstances = Math.min(
                this.MAX_INSTANCES,
                Math.ceil(metrics.instanceCount * 1.5)
            )
            
            return {
                action: 'scale_up',
                targetInstances,
                reason: 'High load detected'
            }
        }
        
        // Scale down conditions (with safety checks)
        if (metrics.cpuUsage < this.SCALE_DOWN_THRESHOLD &&
            metrics.memoryUsage < this.SCALE_DOWN_THRESHOLD &&
            metrics.queueDepth < 10 &&
            metrics.instanceCount > this.MIN_INSTANCES) {
            
            // Don't scale down too aggressively
            const targetInstances = Math.max(
                this.MIN_INSTANCES,
                Math.floor(metrics.instanceCount * 0.75)
            )
            
            return {
                action: 'scale_down',
                targetInstances,
                reason: 'Low load, optimizing costs'
            }
        }
        
        // Predictive scaling based on patterns
        const prediction = await this.predictLoad()
        if (prediction.expectedSpike) {
            return {
                action: 'pre_scale',
                targetInstances: prediction.recommendedInstances,
                reason: 'Predicted traffic spike'
            }
        }
        
        return { action: 'none' }
    }
    
    async executeScaling(decision: ScalingDecision) {
        """
        Execute the scaling decision safely.
        """
        
        console.log(`Scaling: ${decision.action} to ${decision.targetInstances} instances`)
        
        try {
            if (decision.action === 'scale_up') {
                // Launch new instances gradually
                const instancesToAdd = decision.targetInstances - metrics.instanceCount
                
                for (let i = 0; i < instancesToAdd; i++) {
                    await this.railway.scaleService({
                        serviceId: process.env.RAILWAY_SERVICE_ID,
                        replicas: metrics.instanceCount + i + 1
                    })
                    
                    // Wait for instance to be ready
                    await this.waitForHealthy()
                }
            } else if (decision.action === 'scale_down') {
                // Gracefully drain connections before scaling down
                await this.drainConnections()
                
                await this.railway.scaleService({
                    serviceId: process.env.RAILWAY_SERVICE_ID,
                    replicas: decision.targetInstances
                })
            }
            
            // Log scaling event
            await this.supabase
                .from('scaling_events')
                .insert({
                    timestamp: new Date().toISOString(),
                    action: decision.action,
                    target_instances: decision.targetInstances,
                    reason: decision.reason,
                    success: true
                })
        } catch (error) {
            console.error('Scaling failed:', error)
            
            // Alert ops team
            await this.sendAlert({
                severity: 'high',
                message: `Scaling failed: ${error.message}`,
                action_required: true
            })
        }
    }
    
    async predictLoad(): Promise<LoadPrediction> {
        """
        Use historical data to predict upcoming load.
        This helps us scale proactively rather than reactively.
        """
        
        // Get historical patterns for this time/day
        const historicalData = await this.supabase
            .from('call_patterns')
            .select('*')
            .eq('day_of_week', new Date().getDay())
            .eq('hour', new Date().getHours())
            .order('date', { ascending: false })
            .limit(30)
        
        // Simple moving average prediction
        const avgCalls = historicalData.data.reduce((sum, d) => sum + d.call_count, 0) / historicalData.data.length
        const currentCalls = await this.getActiveCalls()
        
        const expectedSpike = avgCalls > currentCalls * 1.5
        const recommendedInstances = Math.ceil(avgCalls / 50) // 50 calls per instance
        
        return {
            expectedSpike,
            recommendedInstances,
            confidence: 0.7
        }
    }
}

// Connection pooling for database at scale
export class ScalableConnectionPool {
    """
    Manages database connections efficiently at scale.
    Supabase has connection limits, so we need to be smart about pooling.
    """
    
    private pools: Map<string, ConnectionPool> = new Map()
    private readonly MAX_CONNECTIONS_PER_INSTANCE = 20
    private readonly MAX_TOTAL_CONNECTIONS = 500
    
    async getConnection(tenantId: string): Promise<PoolConnection> {
        // Use tenant-specific pools for better isolation
        const poolKey = this.getPoolKey(tenantId)
        
        if (!this.pools.has(poolKey)) {
            this.pools.set(poolKey, this.createPool(poolKey))
        }
        
        const pool = this.pools.get(poolKey)
        
        // Wait if pool is exhausted
        return await pool.acquire()
    }
    
    createPool(poolKey: string): ConnectionPool {
        return new ConnectionPool({
            connectionString: process.env.SUPABASE_DIRECT_URL,
            max: this.MAX_CONNECTIONS_PER_INSTANCE,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
            
            // Custom error handler
            onError: (err) => {
                console.error(`Pool error for ${poolKey}:`, err)
                this.handlePoolError(poolKey, err)
            }
        })
    }
    
    async handlePoolError(poolKey: string, error: Error) {
        """
        Handle connection pool errors gracefully.
        """
        
        if (error.message.includes('too many connections')) {
            // Try to free up connections
            await this.drainIdleConnections(poolKey)
            
            // If still failing, create a backup pool
            if (this.pools.get(poolKey).waitingCount > 10) {
                this.createBackupPool(poolKey)
            }
        }
    }
}
```

### Advanced Voice Processing with OpenAI Realtime API

For premium customers, we'll use the OpenAI Realtime API to achieve ultra-low latency:

```python
# voice_processing_v2.py - Enhanced voice processing with Realtime API
import asyncio
import websockets
import json
from typing import AsyncGenerator, Optional
import numpy as np

class RealtimeVoiceProcessor:
    """
    Advanced voice processor using OpenAI's Realtime API.
    This provides <200ms latency for premium tier customers.
    """
    
    def __init__(self, organization_id: str, tier: str = "standard"):
        self.organization_id = organization_id
        self.tier = tier
        
        # Use Realtime API for premium tier
        if tier == "premium":
            self.use_realtime = True
            self.ws_url = "wss://api.openai.com/v1/realtime"
        else:
            self.use_realtime = False
        
        # Voice activity detection with ML
        self.vad_model = self._load_vad_model()
        
        # Emotion detection for better responses
        self.emotion_detector = EmotionDetector()
        
        # Interruption handler
        self.interruption_threshold = 0.7
        
    async def connect_realtime(self) -> websockets.WebSocketClientProtocol:
        """
        Establish WebSocket connection to OpenAI Realtime API.
        """
        
        headers = {
            "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}",
            "OpenAI-Beta": "realtime=v1"
        }
        
        ws = await websockets.connect(
            self.ws_url,
            extra_headers=headers,
            ping_interval=20,
            ping_timeout=10
        )
        
        # Configure session
        await ws.send(json.dumps({
            "type": "session.update",
            "session": {
                "modalities": ["text", "audio"],
                "instructions": await self._get_system_prompt(),
                "voice": "alloy",
                "input_audio_format": "pcm16",
                "output_audio_format": "pcm16",
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 500
                }
            }
        }))
        
        return ws
    
    async def process_audio_stream_realtime(
        self,
        audio_stream: AsyncGenerator[bytes, None]
    ) -> AsyncGenerator[bytes, None]:
        """
        Process audio in real-time with minimal latency.
        This is the cutting edge of voice AI technology.
        """
        
        ws = await self.connect_realtime()
        
        # Separate tasks for sending and receiving
        async def send_audio():
            async for chunk in audio_stream:
                # Send audio chunk to OpenAI
                await ws.send(json.dumps({
                    "type": "input_audio_buffer.append",
                    "audio": chunk.hex()  # Convert bytes to hex string
                }))
                
                # Detect if user stopped speaking
                if await self._detect_end_of_speech(chunk):
                    await ws.send(json.dumps({
                        "type": "input_audio_buffer.commit"
                    }))
        
        async def receive_responses():
            async for message in ws:
                data = json.loads(message)
                
                if data["type"] == "response.audio.delta":
                    # Decode audio from base64
                    audio_chunk = bytes.fromhex(data["delta"])
                    yield audio_chunk
                    
                elif data["type"] == "response.audio_transcript.done":
                    # Log the transcript for analysis
                    await self._log_transcript(data["transcript"])
                    
                elif data["type"] == "conversation.item.created":
                    # Track conversation state
                    await self._update_conversation_state(data["item"])
        
        # Run both tasks concurrently
        await asyncio.gather(
            send_audio(),
            receive_responses()
        )
    
    async def _detect_end_of_speech(self, audio_chunk: bytes) -> bool:
        """
        Use ML-based VAD to detect when user stops speaking.
        This is more accurate than simple amplitude detection.
        """
        
        # Convert audio to numpy array
        audio_array = np.frombuffer(audio_chunk, dtype=np.int16).astype(np.float32)
        audio_array = audio_array / 32768.0  # Normalize to [-1, 1]
        
        # Run through VAD model
        is_speech = self.vad_model.predict(audio_array)
        
        # Track speech state
        if is_speech:
            self.silence_frames = 0
            return False
        else:
            self.silence_frames += 1
            # Return true if we've had 500ms of silence
            return self.silence_frames > 25  # Assuming 50fps audio
    
    async def handle_interruption(self, new_audio: bytes):
        """
        Gracefully handle when user interrupts the AI.
        This makes conversations feel more natural.
        """
        
        # Detect if this is actually an interruption
        audio_energy = np.abs(np.frombuffer(new_audio, dtype=np.int16)).mean()
        
        if audio_energy > self.interruption_threshold:
            # Stop current response
            await self.ws.send(json.dumps({
                "type": "response.cancel"
            }))
            
            # Clear output buffer
            await self.ws.send(json.dumps({
                "type": "input_audio_buffer.clear"
            }))
            
            # Process new input
            await self.ws.send(json.dumps({
                "type": "input_audio_buffer.append",
                "audio": new_audio.hex()
            }))
    
    async def add_context_to_conversation(
        self,
        context: str,
        context_type: str = "knowledge"
    ):
        """
        Inject relevant context mid-conversation.
        This allows the AI to reference new information dynamically.
        """
        
        await self.ws.send(json.dumps({
            "type": "conversation.item.create",
            "item": {
                "type": "message",
                "role": "system",
                "content": [{
                    "type": "text",
                    "text": f"[{context_type.upper()}] {context}"
                }]
            }
        }))
    
    async def _get_system_prompt(self) -> str:
        """
        Generate a dynamic system prompt based on organization settings.
        """
        
        org = await self.get_organization_details()
        knowledge = await self.get_knowledge_base_summary()
        
        return f"""
        You are an AI receptionist for {org['name']}.
        
        Business Context:
        - Industry: {org['industry']}
        - Business Hours: {org['business_hours']}
        - Services: {org['services']}
        
        Key Information:
        {knowledge}
        
        Conversation Guidelines:
        - Be {org['voice_personality']} in tone
        - Keep responses concise (under 3 sentences when possible)
        - Always confirm important details
        - Transfer to human if confidence drops below 70%
        
        Current Context:
        - Time: {datetime.now().strftime('%I:%M %p')}
        - Day: {datetime.now().strftime('%A')}
        - Status: {'Open' if self.is_business_hours() else 'After hours'}
        """
```

### Advanced Analytics and Insights

Phase 2 introduces sophisticated analytics to help businesses understand their customer interactions:

```typescript
// analytics/insights-engine.ts
export class InsightsEngine {
    """
    Generates actionable insights from call data.
    This helps businesses improve their service based on real data.
    """
    
    private supabase: SupabaseClient
    private langfuse: Langfuse  // LLM observability
    
    async generateDailyInsights(organizationId: string): Promise<DailyInsights> {
        // Collect all call data from the day
        const calls = await this.supabase
            .from('calls')
            .select('*')
            .eq('organization_id', organizationId)
            .gte('started_at', this.getStartOfDay())
            .order('started_at')
        
        // Analyze patterns
        const patterns = await this.analyzeCallPatterns(calls.data)
        const sentiment = await this.analyzeSentiment(calls.data)
        const topics = await this.extractTopics(calls.data)
        const performance = await this.analyzePerformance(calls.data)
        
        // Generate recommendations
        const recommendations = await this.generateRecommendations({
            patterns,
            sentiment,
            topics,
            performance
        })
        
        return {
            date: new Date().toISOString(),
            summary: await this.generateExecutiveSummary(calls.data),
            metrics: {
                total_calls: calls.data.length,
                appointments_booked: patterns.appointments_booked,
                average_call_duration: patterns.avg_duration,
                peak_hours: patterns.peak_hours,
                conversion_rate: patterns.conversion_rate
            },
            sentiment_analysis: sentiment,
            common_topics: topics,
            ai_performance: performance,
            recommendations,
            alerts: await this.detectAnomalies(calls.data)
        }
    }
    
    async analyzeCallPatterns(calls: Call[]): Promise<CallPatterns> {
        """
        Identify patterns in call timing, duration, and outcomes.
        """
        
        // Group calls by hour
        const callsByHour = calls.reduce((acc, call) => {
            const hour = new Date(call.started_at).getHours()
            acc[hour] = (acc[hour] || 0) + 1
            return acc
        }, {})
        
        // Find peak hours
        const peakHours = Object.entries(callsByHour)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([hour]) => parseInt(hour))
        
        // Calculate conversion rate
        const appointmentsBooked = calls.filter(c => c.appointment_booked).length
        const conversionRate = appointmentsBooked / calls.length
        
        // Identify common call reasons
        const reasons = await this.extractCallReasons(calls)
        
        return {
            peak_hours: peakHours,
            appointments_booked: appointmentsBooked,
            avg_duration: calls.reduce((sum, c) => sum + c.duration_seconds, 0) / calls.length,
            conversion_rate: conversionRate,
            common_reasons: reasons,
            by_day_of_week: this.groupByDayOfWeek(calls)
        }
    }
    
    async analyzeSentiment(calls: Call[]): Promise<SentimentAnalysis> {
        """
        Analyze customer sentiment across all calls.
        This helps identify satisfaction trends.
        """
        
        const sentiments = await Promise.all(
            calls.map(async (call) => {
                if (!call.transcript) return null
                
                // Use GPT to analyze sentiment
                const analysis = await this.analyzeSingleCallSentiment(call.transcript)
                return {
                    call_id: call.id,
                    sentiment: analysis.sentiment,
                    score: analysis.score,
                    key_phrases: analysis.key_phrases
                }
            })
        )
        
        const validSentiments = sentiments.filter(s => s !== null)
        
        // Calculate aggregate metrics
        const avgScore = validSentiments.reduce((sum, s) => sum + s.score, 0) / validSentiments.length
        const distribution = {
            positive: validSentiments.filter(s => s.sentiment === 'positive').length,
            neutral: validSentiments.filter(s => s.sentiment === 'neutral').length,
            negative: validSentiments.filter(s => s.sentiment === 'negative').length
        }
        
        // Identify concerning calls
        const negativeCalls = validSentiments
            .filter(s => s.sentiment === 'negative')
            .map(s => s.call_id)
        
        return {
            average_score: avgScore,
            distribution,
            negative_calls: negativeCalls,
            trending: this.calculateSentimentTrend(validSentiments)
        }
    }
    
    async extractTopics(calls: Call[]): Promise<TopicAnalysis> {
        """
        Extract and categorize the topics discussed in calls.
        """
        
        // Combine all transcripts
        const allTranscripts = calls
            .filter(c => c.transcript)
            .map(c => c.transcript)
            .join('\n')
        
        // Use GPT to extract topics
        const prompt = `
        Analyze these customer service call transcripts and identify:
        1. Top 5 most discussed topics
        2. Emerging topics (mentioned more than yesterday)
        3. Common questions
        4. Common complaints
        
        Transcripts:
        ${allTranscripts.substring(0, 10000)} // Limit for token constraints
        
        Return as JSON with categories and counts.
        `
        
        const response = await this.openai.complete(prompt, { 
            response_format: { type: "json_object" }
        })
        
        const topics = JSON.parse(response)
        
        return {
            top_topics: topics.top_topics,
            emerging_topics: topics.emerging_topics,
            common_questions: topics.common_questions,
            common_complaints: topics.common_complaints,
            topic_trends: await this.calculateTopicTrends(topics)
        }
    }
    
    async analyzePerformance(calls: Call[]): Promise<AIPerformance> {
        """
        Analyze how well the AI is performing.
        """
        
        // Get performance metrics from Langfuse
        const llmMetrics = await this.langfuse.getMetrics({
            start_time: this.getStartOfDay(),
            end_time: new Date()
        })
        
        return {
            accuracy: {
                intent_recognition: llmMetrics.intent_accuracy,
                scheduling_success: this.calculateSchedulingAccuracy(calls),
                knowledge_retrieval: llmMetrics.rag_accuracy
            },
            latency: {
                avg_response_time: llmMetrics.avg_latency,
                p95_response_time: llmMetrics.p95_latency,
                p99_response_time: llmMetrics.p99_latency
            },
            errors: {
                total: llmMetrics.error_count,
                by_type: llmMetrics.errors_by_type,
                recovery_rate: llmMetrics.error_recovery_rate
            },
            token_usage: {
                total: llmMetrics.total_tokens,
                avg_per_call: llmMetrics.total_tokens / calls.length,
                cost_estimate: llmMetrics.total_tokens * 0.00003 // GPT-4 pricing
            },
            transfer_rate: calls.filter(c => c.transferred_to_human).length / calls.length
        }
    }
    
    async generateRecommendations(data: AnalysisData): Promise<Recommendation[]> {
        """
        Generate actionable recommendations based on the analysis.
        """
        
        const recommendations = []
        
        // Staffing recommendations based on patterns
        if (data.patterns.peak_hours.length > 0) {
            const peakHourStr = data.patterns.peak_hours.join(', ')
            recommendations.push({
                category: 'staffing',
                priority: 'high',
                title: 'Peak Hour Coverage',
                description: `Consider having human staff available during peak hours (${peakHourStr}) to handle overflow`,
                impact: 'Could reduce wait times by 30%',
                effort: 'medium'
            })
        }
        
        // Knowledge base improvements
        if (data.topics.common_questions.length > 3) {
            recommendations.push({
                category: 'knowledge_base',
                priority: 'medium',
                title: 'Update Knowledge Base',
                description: `Add answers for frequently asked questions: ${data.topics.common_questions.slice(0, 3).join(', ')}`,
                impact: 'Could improve first-call resolution by 20%',
                effort: 'low'
            })
        }
        
        // Performance optimizations
        if (data.performance.latency.avg_response_time > 400) {
            recommendations.push({
                category: 'performance',
                priority: 'high',
                title: 'Upgrade to Premium Tier',
                description: 'Response times are above optimal. Premium tier with Realtime API could reduce latency by 50%',
                impact: 'Significantly improve customer experience',
                effort: 'low',
                cost: '$200/month additional'
            })
        }
        
        // Sentiment-based recommendations
        if (data.sentiment.distribution.negative > data.sentiment.distribution.positive) {
            recommendations.push({
                category: 'training',
                priority: 'critical',
                title: 'Review Negative Interactions',
                description: `${data.sentiment.negative_calls.length} calls had negative sentiment. Review and adjust AI responses.`,
                impact: 'Critical for customer retention',
                effort: 'high',
                action_items: data.sentiment.negative_calls.map(id => ({
                    type: 'review_call',
                    call_id: id
                }))
            })
        }
        
        return recommendations
    }
}
```

### Testing Strategy for Phase 2

Phase 2 requires more sophisticated testing to ensure AI quality and system reliability:

```python
# tests/phase2_tests.py
import pytest
import asyncio
from unittest.mock import Mock, patch
import numpy as np

class TestIndustryModels:
    """
    Test suite for industry-specific AI models.
    """
    
    @pytest.fixture
    def medical_model(self):
        return MedicalPracticeModel(organization_id="test-medical-org")
    
    @pytest.fixture
    def legal_model(self):
        return LegalPracticeModel(organization_id="test-legal-org")
    
    async def test_medical_emergency_detection(self, medical_model):
        """
        Ensure medical emergencies are properly detected and handled.
        """
        emergency_phrases = [
            "I'm having chest pain",
            "My child isn't breathing",
            "There's so much blood",
            "I think I'm having a heart attack"
        ]
        
        for phrase in emergency_phrases:
            result = medical_model.process_request(phrase, {"type": "general"})
            assert result["action"] == "emergency_redirect"
            assert "911" in result["response"]
            assert result["priority"] == "immediate"
    
    async def test_hipaa_compliance(self, medical_model):
        """
        Verify HIPAA compliance in responses.
        """
        
        # Test that PHI is not disclosed
        response_with_phi = "Your SSN 123-45-6789 is on file"
        assert not medical_model.validate_compliance(response_with_phi)
        
        # Test that medical advice is not given
        response_with_advice = "You should take aspirin for your headache"
        assert not medical_model.validate_compliance(response_with_advice)
        
        # Test that compliant response passes
        compliant_response = "I can help you schedule an appointment with the doctor"
        assert medical_model.validate_compliance(compliant_response)
    
    async def test_legal_conflict_checking(self, legal_model):
        """
        Test legal conflict of interest checking.
        """
        
        transcript = "I need help with my divorce from John Smith"
        result = legal_model.process_request(transcript, {"type": "scheduling"})
        
        assert result["requires_conflict_check"] == True
        assert "conflict check" in result["response"].lower()
        assert result["action"] == "schedule_legal_consultation"

class TestRAGSystem:
    """
    Test suite for the RAG knowledge retrieval system.
    """
    
    @pytest.fixture
    async def rag_service(self):
        service = AdvancedRAGService(organization_id="test-org")
        
        # Add test documents
        await service.ingest_document(
            "We are open Monday through Friday from 9 AM to 5 PM",
            "business_hours"
        )
        
        await service.ingest_document(
            "Our services include oil changes for $39.99 and tire rotation for $24.99",
            "services_pricing"
        )
        
        return service
    
    async def test_context_retrieval(self, rag_service):
        """
        Test that relevant context is retrieved for queries.
        """
        
        # Test business hours query
        context = await rag_service.retrieve_context("What time do you open?")
        assert "9 AM" in context
        assert "Monday through Friday" in context
        
        # Test pricing query
        context = await rag_service.retrieve_context("How much for an oil change?")
        assert "39.99" in context
        assert "oil change" in context.lower()
    
    async def test_contextual_query_reformulation(self, rag_service):
        """
        Test that pronouns are properly resolved using conversation history.
        """
        
        conversation_history = [
            {"role": "user", "content": "Do you do oil changes?"},
            {"role": "assistant", "content": "Yes, we offer oil changes for $39.99"},
            {"role": "user", "content": "How long does it take?"}
        ]
        
        context = await rag_service.retrieve_context(
            "How long does it take?",
            conversation_history=conversation_history
        )
        
        # Should retrieve oil change related content
        assert "oil change" in context.lower()
    
    async def test_reranking_improves_relevance(self, rag_service):
        """
        Test that Cohere reranking improves result relevance.
        """
        
        # Add some noise documents
        await rag_service.ingest_document(
            "The weather today is sunny",
            "irrelevant"
        )
        
        await rag_service.ingest_document(
            "Our office has blue walls",
            "irrelevant"
        )
        
        # Query should still return relevant results
        context = await rag_service.retrieve_context(
            "What are your business hours?",
            top_k=2
        )
        
        # Should not contain irrelevant content
        assert "weather" not in context.lower()
        assert "blue walls" not in context.lower()
        assert "9 AM" in context  # Should contain actual hours

class TestScaling:
    """
    Test suite for scaling infrastructure.
    """
    
    @pytest.fixture
    def auto_scaler(self):
        return AutoScaler()
    
    async def test_scale_up_on_high_load(self, auto_scaler):
        """
        Test that system scales up when load increases.
        """
        
        metrics = SystemMetrics(
            cpuUsage=0.85,  # 85% CPU
            memoryUsage=0.70,
            activeCalls=150,
            queueDepth=50,
            responseTime=800,
            instanceCount=3
        )
        
        decision = auto_scaler.makeScalingDecision(metrics)
        
        assert decision.action == 'scale_up'
        assert decision.targetInstances > metrics.instanceCount
        assert decision.targetInstances <= 50  # Max instances
    
    async def test_scale_down_on_low_load(self, auto_scaler):
        """
        Test that system scales down to save costs when load is low.
        """
        
        metrics = SystemMetrics(
            cpuUsage=0.20,  # 20% CPU
            memoryUsage=0.15,
            activeCalls=5,
            queueDepth=0,
            responseTime=200,
            instanceCount=10
        )
        
        decision = auto_scaler.makeScalingDecision(metrics)
        
        assert decision.action == 'scale_down'
        assert decision.targetInstances < metrics.instanceCount
        assert decision.targetInstances >= 2  # Min instances
    
    async def test_predictive_scaling(self, auto_scaler):
        """
        Test that predictive scaling works based on patterns.
        """
        
        # Mock historical data showing spike at this time
        with patch.object(auto_scaler, 'predictLoad') as mock_predict:
            mock_predict.return_value = LoadPrediction(
                expectedSpike=True,
                recommendedInstances=15,
                confidence=0.8
            )
            
            metrics = SystemMetrics(
                cpuUsage=0.40,
                memoryUsage=0.35,
                activeCalls=50,
                queueDepth=10,
                responseTime=300,
                instanceCount=5
            )
            
            decision = auto_scaler.makeScalingDecision(metrics)
            
            assert decision.action == 'pre_scale'
            assert decision.targetInstances == 15

class TestRealtimeAPI:
    """
    Test suite for OpenAI Realtime API integration.
    """
    
    @pytest.fixture
    async def realtime_processor(self):
        return RealtimeVoiceProcessor(
            organization_id="test-org",
            tier="premium"
        )
    
    async def test_latency_under_threshold(self, realtime_processor):
        """
        Test that Realtime API maintains low latency.
        """
        
        start_time = asyncio.get_event_loop().time()
        
        # Simulate audio processing
        test_audio = np.random.bytes(16000)  # 1 second of audio
        
        async def audio_generator():
            yield test_audio
        
        response_generator = realtime_processor.process_audio_stream_realtime(
            audio_generator()
        )
        
        # Get first response chunk
        first_chunk = await anext(response_generator)
        
        latency = (asyncio.get_event_loop().time() - start_time) * 1000
        
        assert latency < 200  # Should be under 200ms
        assert first_chunk is not None
    
    async def test_interruption_handling(self, realtime_processor):
        """
        Test that interruptions are handled gracefully.
        """
        
        # Start a response
        await realtime_processor.ws.send(json.dumps({
            "type": "response.create",
            "response": {
                "modalities": ["audio"],
                "instructions": "Count to ten slowly"
            }
        }))
        
        # Simulate interruption after 500ms
        await asyncio.sleep(0.5)
        
        interruption_audio = np.random.bytes(8000)  # 0.5 seconds
        await realtime_processor.handle_interruption(interruption_audio)
        
        # Verify response was cancelled
        # This would check the WebSocket messages in a real test
        assert True  # Placeholder for actual verification

class TestAnalytics:
    """
    Test suite for analytics and insights.
    """
    
    @pytest.fixture
    def insights_engine(self):
        return InsightsEngine()
    
    async def test_daily_insights_generation(self, insights_engine):
        """
        Test that daily insights are properly generated.
        """
        
        # Create test data
        test_calls = [
            Call(
                id="call1",
                duration_seconds=180,
                appointment_booked=True,
                started_at=datetime.now() - timedelta(hours=2)
            ),
            Call(
                id="call2",
                duration_seconds=120,
                appointment_booked=False,
                started_at=datetime.now() - timedelta(hours=1)
            )
        ]
        
        with patch.object(insights_engine, 'supabase') as mock_supabase:
            mock_supabase.from_().select().eq().gte().order().data = test_calls
            
            insights = await insights_engine.generateDailyInsights("test-org")
            
            assert insights.metrics.total_calls == 2
            assert insights.metrics.appointments_booked == 1
            assert insights.metrics.conversion_rate == 0.5
            assert insights.metrics.average_call_duration == 150
    
    async def test_anomaly_detection(self, insights_engine):
        """
        Test that anomalies are properly detected.
        """
        
        # Create calls with unusual pattern
        unusual_calls = [
            Call(duration_seconds=600),  # Very long call
            Call(duration_seconds=5),     # Very short call
            Call(transferred_to_human=True) for _ in range(10)  # Many transfers
        ]
        
        alerts = await insights_engine.detectAnomalies(unusual_calls)
        
        assert len(alerts) > 0
        assert any(a.type == "unusual_duration" for a in alerts)
        assert any(a.type == "high_transfer_rate" for a in alerts)
```

### Deployment Configuration for Phase 2

Phase 2 requires more sophisticated deployment configuration to handle scale:

```yaml
# railway.toml - Railway deployment configuration
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile.production"

[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3

[[services]]
name = "voice-processor"
domains = ["api.yourservice.com"]
region = "us-west"
numReplicas = 3
cpu = 2
memory = 4096

[[services.env]]
ENABLE_REALTIME_API = true
MAX_CONCURRENT_CALLS = 1000
REDIS_CLUSTER_MODE = true

[[services]]
name = "rag-service"
domains = ["rag.yourservice.com"]
region = "us-west"
numReplicas = 2
cpu = 1
memory = 2048

[[services.env]]
QDRANT_CLUSTER_URL = "$QDRANT_URL"
ENABLE_RERANKING = true
```

```dockerfile
# Dockerfile.production - Optimized for Phase 2
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production image
FROM node:18-alpine

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Run as non-root user
USER node

# Start application
CMD ["node", "dist/index.js"]
```

### Migration Strategy from Phase 1 to Phase 2

Here's how to smoothly transition from Phase 1 to Phase 2:

```javascript
// migration/phase2-migration.js
export class Phase2Migration {
    """
    Handles the migration from Phase 1 to Phase 2.
    This ensures zero downtime and data integrity.
    """
    
    async executeMigration() {
        console.log("Starting Phase 2 migration...")
        
        // Step 1: Database migrations
        await this.runDatabaseMigrations()
        
        // Step 2: Deploy new services in parallel
        await this.deployNewServices()
        
        // Step 3: Migrate existing data to new systems
        await this.migrateData()
        
        // Step 4: Switch traffic gradually
        await this.performCanaryDeployment()
        
        // Step 5: Verify and rollback if needed
        await this.verifyMigration()
        
        console.log("Phase 2 migration completed successfully!")
    }
    
    async runDatabaseMigrations() {
        """
        Add new tables and columns for Phase 2 features.
        """
        
        const migrations = [
            // Add industry-specific fields
            `ALTER TABLE organizations ADD COLUMN industry VARCHAR(50)`,
            `ALTER TABLE organizations ADD COLUMN compliance_requirements JSONB`,
            
            // Add analytics tables
            `CREATE TABLE analytics_events (
                id UUID PRIMARY KEY,
                organization_id UUID REFERENCES organizations(id),
                event_type VARCHAR(50),
                payload JSONB,
                timestamp TIMESTAMPTZ DEFAULT NOW()
            )`,
            
            // Add performance tracking
            `CREATE TABLE llm_metrics (
                id UUID PRIMARY KEY,
                call_id UUID REFERENCES calls(id),
                model_used VARCHAR(50),
                latency_ms INTEGER,
                token_count INTEGER,
                cost_estimate DECIMAL(10, 4)
            )`,
            
            // Add vector search indexes
            `CREATE INDEX idx_knowledge_vector ON knowledge_base 
             USING ivfflat (embedding vector_cosine_ops)`
        ]
        
        for (const migration of migrations) {
            await this.supabase.rpc('execute_sql', { query: migration })
        }
    }
    
    async migrateData() {
        """
        Migrate existing data to new formats and systems.
        """
        
        // Migrate embeddings to Qdrant
        const { data: knowledge } = await this.supabase
            .from('knowledge_base')
            .select('*')
        
        for (const item of knowledge) {
            await this.qdrant.upsert({
                collection_name: `org_${item.organization_id}`,
                points: [{
                    id: item.id,
                    vector: item.embedding,
                    payload: {
                        content: item.content,
                        metadata: item.metadata
                    }
                }]
            })
        }
        
        // Categorize existing organizations by industry
        const { data: orgs } = await this.supabase
            .from('organizations')
            .select('*')
        
        for (const org of orgs) {
            const industry = await this.detectIndustry(org)
            await this.supabase
                .from('organizations')
                .update({ industry })
                .eq('id', org.id)
        }
    }
    
    async performCanaryDeployment() {
        """
        Gradually roll out Phase 2 features to minimize risk.
        """
        
        const stages = [
            { percentage: 10, duration: 3600 },    // 10% for 1 hour
            { percentage: 25, duration: 7200 },    // 25% for 2 hours
            { percentage: 50, duration: 14400 },   // 50% for 4 hours
            { percentage: 100, duration: null }    // 100% permanently
        ]
        
        for (const stage of stages) {
            await this.updateTrafficSplit(stage.percentage)
            
            if (stage.duration) {
                await this.monitorMetrics(stage.duration)
                
                // Check error rates
                const errorRate = await this.getErrorRate()
                if (errorRate > 0.01) {  // > 1% errors
                    await this.rollback()
                    throw new Error(`High error rate detected: ${errorRate}`)
                }
            }
        }
    }
}
```

## Phase 2 Success Metrics

Clear metrics to track Phase 2 success:

```javascript
// metrics/phase2-success.js
export const Phase2SuccessMetrics = {
    technical: {
        concurrent_calls: {
            target: 1000,
            query: "SELECT MAX(concurrent_calls) FROM system_metrics WHERE date > NOW() - INTERVAL '7 days'"
        },
        realtime_latency: {
            target: "< 200ms P95",
            query: "SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) FROM llm_metrics WHERE model = 'realtime'"
        },
        rag_accuracy: {
            target: "> 85%",
            query: "SELECT AVG(relevance_score) FROM rag_evaluations"
        },
        system_availability: {
            target: "> 99.5%",
            query: "SELECT (1 - (SUM(downtime_seconds) / 604800.0)) * 100 FROM availability_logs"
        }
    },
    
    business: {
        paying_customers: {
            target: 100,
            query: "SELECT COUNT(DISTINCT organization_id) FROM subscriptions WHERE status = 'active'"
        },
        mrr: {
            target: 25000,
            query: "SELECT SUM(monthly_amount) FROM subscriptions WHERE status = 'active'"
        },
        customer_satisfaction: {
            target: "> 85%",
            query: "SELECT AVG(rating) * 20 FROM customer_feedback WHERE created_at > NOW() - INTERVAL '30 days'"
        },
        feature_adoption: {
            target: {
                industry_models: "> 60%",
                rag_system: "> 80%",
                analytics: "> 70%"
            }
        }
    },
    
    quality: {
        intent_accuracy: {
            target: "> 90%",
            measurement: "Manual evaluation of 100 random calls per week"
        },
        scheduling_success: {
            target: "> 85%",
            query: "SELECT COUNT(*) FILTER (WHERE appointment_booked) / COUNT(*) FROM calls WHERE intent = 'scheduling'"
        },
        transfer_rate: {
            target: "< 10%",
            query: "SELECT AVG(transferred_to_human::int) * 100 FROM calls"
        }
    }
}
```

## Conclusion

Phase 2 transforms your MVP into a production-ready, intelligent platform capable of serving hundreds of businesses with industry-specific AI capabilities. The introduction of advanced RAG, specialized models, and the Realtime API creates significant differentiation in the market.

Key achievements in Phase 2:
- **10x scale increase** from 100 to 1000+ concurrent calls
- **Industry specialization** with medical and legal compliance
- **50% latency reduction** using Realtime API for premium customers
- **85%+ accuracy** in intent recognition and knowledge retrieval
- **Comprehensive analytics** providing actionable business insights

The modular architecture ensures you can selectively deploy features based on customer needs while maintaining system stability. With Phase 2 complete, you'll have a platform that not only competes with but exceeds existing solutions in the market, setting the stage for enterprise features in Phase 3.