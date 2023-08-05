import { CallbackManager } from "langchain/callbacks";
import { BaseSingleActionAgent } from "langchain/agents";
import { AgentStep, ChainValues, AgentAction, AgentFinish } from "langchain/schema";
import { LLMChain, PromptTemplate } from "langchain";
import { OpenAIBaseInput } from "langchain/dist/types/openai-types";
import { ChatOpenAI } from "langchain/chat_models/openai";



export class HotelAgent extends BaseSingleActionAgent {

    private _parameters


    constructor(parameters) {
        super()
        this._parameters = parameters
    }

    private getPrompt = (prompt) => {
        return (prompt && prompt.length > 0) ? PromptTemplate.fromTemplate(prompt) : null
    }

    private stepsToText = (steps: any[]) => {
        let out = ""
        for (const s of steps) {
            out += `\n- Input : ${s.action.toolInput}\t Output: ${s.observation}\n`
        }
        return out
    }

    private toolsToText = (tools: any[]) => {
        let out = ""
        for (const t of tools) {
            out += `\n- Tool Name : ${t.name}\t Tool Description: ${t.description}\n`
        }
        return out
    }

    plan = async (steps: AgentStep[], inputs: ChainValues, callbackManager?: CallbackManager): Promise<AgentAction | AgentFinish> => {
        //const llmConfig: OpenAIBaseInput = this._parameters.llmConfig
        const llm = new ChatOpenAI({
            temperature: 0.1,
            topP: 0,
            frequencyPenalty: 0.1,
            presencePenalty: 0,
            n: 1,
            streaming: false,
            modelName: "gpt-3.5-turbo",
            maxConcurrency: 1
        })
        const customPrompt = `Task Description:  A list of tools and a question will be given.  If the question is answered under "Completed Steps", return "completed".  Otherwise, choose a tool name that can logically help to answer the question.


        Question: Give me a list of hotels near burlington, vt.

        Here are the available tools:
        - Tool Name : search_hotels    Tool Description: for a given location, return a list of hotels
        - Tool Name : hotel_questions    Tool Description: given a list of hotels, answer questions about the hotels
        
        Completed Steps:    
        
        Result:
        search_hotels<stop>


        Question: Give me a list of hotels near burlington, vt.

        Here are the available tools:
        - Tool Name : search_hotels    Tool Description: for a given location, return a list of hotels
        - Tool Name : hotel_questions    Tool Description: given a list of hotels, answer questions about the hotels
        
        Completed Steps: 
        
        Question: Give me a list of hotels near burlington, vt.    
        Here is a list of hotels: 
        - Montreal
        - Clifton Park
        - Kamloops
        - Malone
        - North Conway
        
        Result:
        completed<stop>
  

        
        Question: Do any hotels near burlington, vt allow pets?   

        Here are the available tools:
        - Tool Name : search_hotels    Tool Description: for a given location, return a list of hotels
        - Tool Name : hotel_questions    Tool Description: given a list of hotels, answer questions about the hotels
        
        Completed Steps:    
        
        Result:
        search_hotels<stop>
        
        
        Question: Do any hotels near burlington, vt allow pets

        Here are the available tools:
        - Tool Name : search_hotels    Tool Description: for a given location, return a list of hotels
        - Tool Name : hotel_questions    Tool Description: given a list of hotels, answer questions about the hotels
        
        Completed Steps: 
        
        Question: Do any hotels near burlington, vt allow pets?     
        Here is a list of hotels: 
        - Montreal
        - Clifton Park
        - Kamloops
        - Malone
        - North Conway
        
        Result:
        hotel_questions<stop>
        
        
        Question: Do any hotels near burlington, vt allow pets

        Here are the available tools:
        - Tool Name : search_hotels    Tool Description: for a given location, return a list of hotels
        - Tool Name : hotel_questions    Tool Description: given a list of hotels, answer questions about the hotels
        
        Completed Steps: 
        
        Question: Do any hotels near burlington, vt allow pets?     
        Here is a list of hotels: 
        - Montreal
        - Clifton Park
        - Kamloops
        - Malone
        - North Conway
        Yes, the Montreal and the Clifton allow service dogs.
        
        Result:
        completed<stop>

        Question: {input}
        
        Here are the available tools:
        {toolList}
        
        Completed Steps:  
        {steps}
        
        Result:
        `

        const queryChain = new LLMChain({ prompt: this.getPrompt(customPrompt), llm: llm })
        const debugPrompt = await this.getPrompt(customPrompt).format({ input: inputs.input, toolList: this.toolsToText(this._parameters.parameters.tools), steps: this.stepsToText(steps) })
        console.log(debugPrompt)
        const stage = await queryChain.call({ input: inputs.input, toolList: this.toolsToText(this._parameters.parameters.tools), steps: this.stepsToText(steps) })
        for (const t of this._parameters.parameters.tools) {
            if (t.name === stage.text.replace('<stop>','')) {
                const action: AgentAction = {
                    tool: t.name,
                    toolInput: inputs["input"],
                    log: `${t.name} with input ${inputs["input"]}`
                }
                return action
            }
        }

        const finish: AgentFinish = {
            returnValues: { steps: steps, inputs: inputs, output: steps[steps.length - 1].observation },
            log: "completed"
        }
        return finish

    }
    get inputKeys(): string[] {
        return []
    }
    _agentActionType(): string {
        return "single"
        //throw new Error("Method not implemented.");
    }
    lc_namespace: string[];

}