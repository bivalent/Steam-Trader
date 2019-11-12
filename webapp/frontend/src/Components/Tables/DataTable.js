import React, { Component } from 'react'
import { Table, Button } from 'reactstrap';
import CreateModalForm from '../Modals/CreateModal'
import BuyModalForm from '../Modals/BuyModal'

class DataTable extends Component {

  deleteTrade = id => {
    let confirmDelete = window.confirm('Delete trade forever?')
    if(confirmDelete){
      fetch('http://localhost:3000/crud', {
      method: 'delete',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        id
      })
    })
      .then(response => response.json())
      .then(trade => {
        this.props.deleteTradeFromState(id)
      })
      .catch(err => console.log(err))
    }

  }

  render() {
    const trades = this.props.trades.map(trade => {
      return (
        <tr key={trade.trade_id}>
          <th scope="row">{trade.trade_id}</th>
          <td>{trade.steam_id}</td>
          <td>{trade.appid}</td>
          <td>{trade.assetid}</td>
          <td>{trade.classid}</td>
          <td>{trade.instanceid}</td>

          <td>{trade.inventoryContext}</td>
          <td>{trade.askingPrice}</td>
          <td>
            <div style={{width:"110px"}}>
              <BuyModalForm buttonLabel="Buy" trade={trade} updateState={this.props.updateState}/>
              {' '}
              <Button color="danger" onClick={() => this.deleteTrade(trade.id)}>Del</Button>
            </div>
          </td>
        </tr>
        )
      })

    return (
      <Table responsive hover>
        <thead>
          <tr>
            <th>TradeId</th>
            <th>SteamId</th>
            <th>AppId</th>
            <th>AssetId</th>
            <th>ClassId</th>
            <th>InstanceId</th>
            <th>inventoryContext</th>
            <th>AskingPrice</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {trades}
        </tbody>
      </Table>
    )
  }
}

export default DataTable
