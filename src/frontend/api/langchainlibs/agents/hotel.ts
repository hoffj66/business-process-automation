import { CallbackManager } from "langchain/callbacks";
import { BaseSingleActionAgent } from "langchain/agents";
import { AgentStep, ChainValues, AgentAction, AgentFinish } from "langchain/schema";
import { LLMChain, PromptTemplate } from "langchain";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { ChatMessageHistory } from "langchain/memory";



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
            out += `${s.observation}\n`
        }
        return out
    }

    private toolsToText = (tools: any[]) => {
        let out = ""
        for (const t of tools) {
            out += `\n- Tool Name : ${t.name}\n Tool Description: ${t.description}\n`
        }
        return out
    }

    private historyToText = async (history : ChatMessageHistory) : Promise<string> => {
        let out = ""
        for(const m of await history.getMessages()){
            out += "\n" + m.content + "\n"
        }
        return out
    }

    plan = async (steps: AgentStep[], inputs: ChainValues, callbackManager?: CallbackManager): Promise<AgentAction | AgentFinish> => {
        if(steps.length > 3){
            const finish: AgentFinish = {
                returnValues: { steps: steps, inputs: inputs, output: "Failed due to logic loop." },
                log: "completed with error"
            }
            return finish
        }
        //const llmConfig: OpenAIBaseInput = this._parameters.llmConfig
        const llm = new ChatOpenAI({
            maxTokens : 50,
            temperature: 0.0,
            topP: 0,
            frequencyPenalty: 0.0,
            presencePenalty: 0,
            n: 1,
            streaming: false,
            modelName: "gpt-3.5-turbo-16",
            maxConcurrency: 1,
            stop:['<stop>']
        })

//         const customPrompt = 
// `Based on the Question and Completed Steps return one of the following: [completed, search_hotels, hotel_information, completed]

// Rules:

// - if the question is not about hotels, hotel locations, events near a hotel, or information about a hotel, return not_in_scope.

// - if a list of hotels exists in the Completed Steps, return completed

// - if there is not a list of hotels in the Completed Steps, return search_hotels

// - if the question is asking for additional information about a group of hotels and the hotels exist in the Completed Steps, return hotel_information

// Examples:

//      Question: "show me hotels near raleigh, nc" 
//      Completed Steps: Hotels: 
// 	- Name: Linyi West 
// 	- Name: Danville 
// 	- Name: Charlotte NE - University Area 
//     Result: completed<stop>

//      Question: "show me hotels near raleigh, nc" 
//      Completed Steps: 
//     Result: search_hotels<stop>

//      Question: "what is the parking policy?" 
//      Completed Steps: Hotels: 
// 	- Name: Linyi West 
// 	- Name: Danville 
// 	- Name: Charlotte NE - University Area 
//     Result: hotel_information<stop>

//      Question: "is wifi available?" 
//      Completed Steps: Hotels: 
// 	- Name: Linyi West 
// 	- Name: Danville 
// 	- Name: Charlotte NE - University Area 
//     Result: hotel_information<stop>

//     Question: "is wifi available?" 
//      Completed Steps: 
//     Result: search_hotels<stop>

//      Question: "i need some hotels near Pittsburgh that have ample parking" 
//      Completed Steps: Hotels: 
// 	- Name: Linyi West 
// 	- Name: Danville 
// 	- Name: Charlotte NE - University Area 

//          Information:
//          - Linyi West : Parking is not available
//          - Danville : There is no mention of parking in the document
//          - Charlotte NE - University Area : There is no mention of parking in the document
//     Result: completed<stop>

//      Question: "what is the pet policy for hotels near raleigh" 
//      Completed Steps: Hotels: 
// 	- Name: Linyi West 
// 	- Name: Danville 
// 	- Name: Charlotte NE - University Area 

//          Information:
//          - Linyi West : Service pets are welcome.
//          - Danville : There is no mention of pets in the document
//          - Charlotte NE - University Area : There is no mention of petsin the document
//     Result: completed<stop>

// Question: "what is the parking policy?" 
//      Completed Steps: Hotels: 
// 	- Name: Linyi West 
// 	- Name: Danville 
// 	- Name: Charlotte NE - University Area 
//     Result: hotel_information<stop>

//      Question: "what are the pet policies for hotels near austin, tx" 
//      Completed Steps: Hotels: 
// 	- Name: Linyi West 
// 	- Name: Danville 
// 	- Name: Charlotte NE - University Area 
//     Result: hotel_information<stop>

//      Question: "what are the pet policies for hotels near austin, tx" 
//      Completed Steps: 
//     Result: search_hotels<stop>


//      Question: "is a cat a mammal?" 
//      Completed Steps: 
//     Result: not_in_scope<stop>


//      Question: "i need a hotel near disney world with ample parking." 
//      Completed Steps: Hotels: 
// 	- Name: Linyi West 
// 	- Name: Danville 
// 	- Name: Charlotte NE - University Area 
//     Result: hotel_information<stop>

//      Question: "my cousin needs to borrow money" 
//      Completed Steps: Hotels: 
// 	- Name: Linyi West 
// 	- Name: Danville 
// 	- Name: Charlotte NE - University Area 
//     Information:
//          - Linyi West : Parking is not available
//          - Danville : There is no mention of parking in the document
//          - Charlotte NE - University Area : There is no mention of parking in the document
//     Result:  not_in_scope


//      Question: "{input}"

//      Completed Steps:
//      {history}
//      {steps}

//      Result:`
        

    
        const queryChain = new LLMChain({ prompt: this.getPrompt(this._parameters.prompt), llm: llm })
        const debugPrompt = await this.getPrompt(this._parameters.prompt).format({ history:  await this.historyToText(inputs.memory.chatHistory),input: inputs.input, toolList: this.toolsToText(this._parameters.parameters.tools), steps: this.stepsToText(steps) })
        console.log(debugPrompt)
        const stage = await queryChain.call({ history:  await this.historyToText(inputs.memory.chatHistory),input: inputs.input, toolList: this.toolsToText(this._parameters.parameters.tools), steps: this.stepsToText(steps) })
        for (const t of this._parameters.parameters.tools) {
            if (t.name === stage.text.replace('<stop>','')) {
                const action: AgentAction = {
                    tool: t.name,
                    toolInput: inputs["input"] ,
                    log: `${t.name} with input ${inputs["input"]}`
                }
                return action
            }
        }

        const finish: AgentFinish = {
            returnValues: { steps: steps, inputs: inputs, output: steps.length > 0 ? steps[steps.length - 1].observation : "" },
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