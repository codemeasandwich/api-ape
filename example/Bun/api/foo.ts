module.exports =  function (this: any, data: { user: string; text: string }): { user: string; text: string } {
    console.log(data)
    return data
}