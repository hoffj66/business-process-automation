
import { Tool } from "langchain/tools";
import { CogSearchRetrievalQAChain } from "../chains/cogSearchRetrievalQA";
import { BufferWindowMemory, ChatMessageHistory } from "langchain/memory";
import { ChainValues } from "langchain/schema";
import { HotelsByGeoChain } from "../chains/hotelsByGeo";
import { HotelQAChain } from "../chains/hotelQA";

export class CogSearchTool extends Tool {

    private _chainParameters : any
    private _memory : BufferWindowMemory
    private _memorySize : number
    private _results : ChainValues[]

    constructor(parameters : any){
        super()
        this._chainParameters = parameters.chainParameters
        this.name = parameters.name
        this.description = parameters.description
        this._memorySize = parameters.memorySize
        this._memory = parameters.memory
        this._results = []
    }

    public name : string

    public description : string

    public getResults = () : ChainValues[] => {
        return this._results
    }

    public _call = async (arg : string) : Promise<string> => {
        let chain
        if(this?._chainParameters?.type === 'geolocation'){
            chain = new HotelsByGeoChain(this._chainParameters, null)
        } else if(this?._chainParameters?.type === 'hotelqa'){
            chain = new HotelQAChain(this._chainParameters)
        } else {
            chain = new CogSearchRetrievalQAChain(this._chainParameters)
        }
        let outputKey = "text"
        if(this?._chainParameters?.type === "refine"){
            outputKey = "output_text"
        }
        const values = await chain.run(arg, this._memory)
        this._results.push(values)
        return values.text
    }
}