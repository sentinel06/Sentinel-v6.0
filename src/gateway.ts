import crypto from 'crypto';

// THE SOVEREIGN POLICY ENGINE
export const evaluateAction = (intent: string, riskScore: number) => {
  console.log(`[GATEWAY]: Evaluating intent: ${intent} (Risk: ${riskScore})`);
  
  if (riskScore >= 0.9) {
    return { status: "REJECTED", code: 403, msg: "CRITICAL_POLICY_VIOLATION" };
  }
  
  // If passed, generate a one-time cryptographic token for AWS/OpenAI
  const signature = crypto.createHmac('sha256', 'PROD_SECRET_DO_NOT_SHARE')
                          .update(`${intent}-${Date.now()}`)
                          .digest('hex');
                          
  return { status: "APPROVED", token: signature };
};
